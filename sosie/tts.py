"""Speech synthesis with a library voice (Chatterbox Multilingual V3, run locally).

Quality loop, the reason this sounds right: the text is cut into sentences; each sentence is drawn several times
(different seeds), transcribed by Whisper and scored: no common word missing, no invented run of words, no abnormal
silence, a plausible speaking rate; then the draw closest to the real voice wins. Sentences are glued with fixed pauses.

Settings that were judged by ear and kept: the whole ~30 s reference given to the decoder (decoder_seconds 30),
exaggeration 0.35, cfg_weight 0.3, temperature 0.6. The Perth watermark is on by default (a voice can turn it off). A slow clone is sped up with WSOLA (tempo), never
with a phase vocoder (metallic)."""
import difflib
import os
import re
import tempfile
import threading
import time

import numpy as np

from . import audio
from . import voices
from .text import strip_tags
from .util import log, read_json, write_json

SR_OUT = 48000
LUFS = -20.0
PAUSE = {".": 0.40, "?": 0.45, "!": 0.40, ":": 0.30, "»": 0.40}
LANGS = {"ar": "العربية", "da": "Dansk", "de": "Deutsch", "el": "Ελληνικά", "en": "English", "es": "Español", "fi": "Suomi",
         "fr": "Français", "he": "עברית", "hi": "हिन्दी", "it": "Italiano", "ja": "日本語", "ko": "한국어", "ms": "Bahasa Melayu",
         "nl": "Nederlands", "no": "Norsk", "pl": "Polski", "pt": "Português", "ru": "Русский", "sv": "Svenska", "sw": "Kiswahili",
         "tr": "Türkçe", "zh": "中文"}
LATIN = {"da", "de", "en", "es", "fi", "fr", "it", "ms", "nl", "no", "pl", "pt", "sv", "sw", "tr"}
# Paralinguistic tags present in the model's vocabulary (lower case only). Not documented for this model: effect uncertain.
# In a French test, [inhale] and [um] made the generation run away (37 s for a 5 s sentence); the quality check rejects such draws.
TAGS = ["sigh", "laughter", "giggle", "guffaw", "whisper", "clear_throat", "cough", "gasp", "groan", "sniff", "exhale", "inhale",
        "shhh", "mumble", "humming", "um", "uh"]


# ------------------------------------------------------------------ what the synthesis reads
def _num(n, lang, year=False):
    from num2words import num2words
    try:
        return num2words(n, to="year", lang=lang) if year else num2words(n, lang=lang)
    except (NotImplementedError, OverflowError):
        return str(n)


def say(text, lang, lexicon=None):
    """Pronunciation: the text the synthesis reads (subtitles keep the original). lexicon: {"rules": [[regex, replacement]…],
    "spell": [acronyms read letter by letter]}, from the project and the voice."""
    lex = lexicon or {}
    text = re.sub(r"«\s*|\s*»", "", text) if lang == "fr" else text.replace('"', "")
    text = re.sub(r"([?!])\s*\.", r"\1", text)
    for a, b in lex.get("rules", []):
        text = re.sub(a, b, text)
    if lex.get("spell"):
        text = re.sub(r"\b(" + "|".join(map(re.escape, lex["spell"])) + r")\b", lambda m: " ".join(m.group(1)), text)
    if lang == "en":
        text = re.sub(r"\b((?:19|20)\d\d)\b", lambda m: _num(int(m.group(1)), lang, year=True), text)
    elif lang == "fr":
        text = re.sub(r"\b(\d{4})\b", lambda m: _num(int(m.group(1)), lang), text)
    text = re.sub(r"\b(\d+)\b", lambda m: _num(int(m.group(1)), lang), text)
    return re.sub(r"\s+", " ", text).strip()


def merge_lexicons(*lexs):
    out = {"rules": [], "spell": []}
    for lx in lexs:
        if lx:
            out["rules"] += lx.get("rules", [])
            out["spell"] += lx.get("spell", [])
    return out


def sentences(text):
    """Sentences to generate: cut after . ? ! and after a quotation, the too short ones glued to their neighbour."""
    parts = [p for p in re.split(r"(?<=[.?!])\s+(?!»)|(?<=[.?!]\s»)\s+|(?<=[.?!]\")\s+", text.strip()) if p]
    out = []
    for p in parts:
        if out and (len(out[-1]) < 30 or len(p) < 14) and len(out[-1]) + len(p) < 220:
            out[-1] += " " + p
        else:
            out.append(p)
    return out


def pause_after(chunk):
    c = chunk.rstrip()
    return PAUSE.get(c[-1], 0.3) if c else 0.3


# ------------------------------------------------------------------ checking a draw
def toks(text, lang):
    """Normalised words to compare the text and the transcription."""
    text = re.sub(r"(?<=\d)[\s  ](?=\d{3}\b)", "", text)
    text = re.sub(r"(\d+)", lambda m: " " + _num(int(m.group(1)), lang) + " ", text)
    text = text.lower().replace("’", "'").replace("%", " pour cent " if lang == "fr" else " percent ").replace("€", " euros ")
    text = re.sub(r"(?<=\w)\.(?=\w)", "", text).replace("'", "")       # I.A. -> ia ; l'IA -> lia
    return re.findall(r"[a-zà-öø-ÿœæ]+", text.replace("-", " "))


def key(t, lang):
    """Heard form of a word: silent endings do not count (French entraîne / entraînent, English plural s)."""
    if lang == "en":
        return t[:-1] if len(t) > 3 and t.endswith("s") else t
    if lang == "fr":
        return re.sub(r"(ent|es|s|x|e|t|d)$", "", t) if len(t) > 3 else t
    return t


def letters(ts):
    """Glues spelled letters ("i a", "r g p d") to compare with "ia", "rgpd"."""
    out = []
    for t in ts:
        if len(t) == 1 and out and len(out[-1][0]) >= 1 and out[-1][1]:
            out[-1] = (out[-1][0] + t, True)
        else:
            out.append((t, len(t) == 1))
    return [t for t, _ in out]


def score(target, heard, dur, lang):
    """Errors: common words (lower case in the text) missing from the transcription, runs of invented words,
    a long silence, an implausible rate (a draw that ran away)."""
    target = strip_tags(target)
    tw = []
    for w in target.split():
        tw += [(key(t, lang), w[0].islower()) for t in letters(toks(w, lang))]
    hw = [key(t, lang) for t in letters([t for w, _, _ in heard for t in toks(w, lang)])]
    sm = difflib.SequenceMatcher(None, [t for t, _ in tw], hw, autojunk=False)
    got, extra = set(), 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            got.update(range(i1, i2))
        elif tag == "replace":
            if difflib.SequenceMatcher(None, "".join(t for t, _ in tw[i1:i2]), "".join(hw[j1:j2])).ratio() >= 0.75:
                got.update(range(i1, i2))
            for i in range(i1, i2):
                if any(difflib.SequenceMatcher(None, tw[i][0], hw[j]).ratio() >= 0.75 for j in range(j1, j2)):
                    got.add(i)
            if (j2 - j1) - (i2 - i1) >= 3:
                extra += (j2 - j1) - (i2 - i1)
        elif tag == "insert" and j2 - j1 >= 3:
            extra += j2 - j1
    missing = [tw[i][0] for i in range(len(tw)) if tw[i][1] and i not in got]
    gaps = [b[1] - a[2] for a, b in zip(heard, heard[1:])]
    long_gap = max(gaps, default=0)
    rate = len(target) / max(dur, 0.1)
    bad = len(missing) + extra + (3 if long_gap > 1.1 else 0)
    if lang in LATIN and not (9 if len(target) >= 30 else 6) <= rate <= 22:    # a short sentence carries proportionally more silence
        bad += 3
    elif lang not in LATIN and dur > 4 + 0.5 * len(target):
        bad += 3
    return bad, missing, extra, long_gap, rate


def glue(heard):
    """Whisper sometimes cuts after an apostrophe ("c'" "est"): such words are glued to the next one."""
    out = []
    for w, s_, e_ in heard:
        if out and re.search(r"['’]$", out[-1][0]):
            out[-1] = (out[-1][0] + w, out[-1][1], e_)
        else:
            out.append((w, s_, e_))
    return out


def trim(wav, sr, heard):
    """Cuts the silence before and after the voice (10 ms frames above -40 dB under the peak) without ever entering
    the words heard by Whisper (whose marks can be 0.1 to 0.2 s off). 10 ms fades."""
    hop = int(0.01 * sr)
    n = len(wav) // hop
    rms = np.sqrt(np.mean(wav[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms / rms.max())
    on = np.where(db > -40)[0]
    a_e, b_e = (on[0] * hop, (on[-1] + 1) * hop) if len(on) else (0, len(wav))
    a_h = int((heard[0][1] - 0.15) * sr) if heard else a_e
    b_h = int((heard[-1][2] + 0.25) * sr) if heard else b_e
    a = max(0, min(a_e - int(0.06 * sr), a_h))
    b = min(len(wav), max(b_e + int(0.12 * sr), b_h))
    x = wav[a:b].copy()
    f = int(0.01 * sr)
    if len(x) > 2 * f:
        x[:f] *= np.linspace(0, 1, f)
        x[-f:] *= np.linspace(1, 0, f)
    return x, a / sr


def align_words(text, heard, lang):
    """Start and end of each word of text.split(), from the transcription; words not recognised are interpolated."""
    W = text.split()
    owner, tt = [], []
    for i, w in enumerate(W):
        for t in toks(w, lang):
            owner.append(i)
            tt.append(t)
    ht = []
    for w, s, e in heard:
        ts = toks(w, lang) or [""]
        d = (e - s) / len(ts)
        ht += [(t, s + k * d, s + (k + 1) * d) for k, t in enumerate(ts)]
    sm = difflib.SequenceMatcher(None, tt, [t for t, _, _ in ht], autojunk=False)
    S, E = [None] * len(W), [None] * len(W)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
            for i, j in zip(range(i1, i2), range(j1, j2)):
                o = owner[i]
                S[o] = ht[j][1] if S[o] is None else min(S[o], ht[j][1])
                E[o] = ht[j][2] if E[o] is None else max(E[o], ht[j][2])
    t_end = heard[-1][2] if heard else 0.0
    known = [i for i in range(len(W)) if S[i] is not None]
    for i in range(len(W)):
        if S[i] is not None:
            continue
        p = max([k for k in known if k < i], default=None)
        n = min([k for k in known if k > i], default=None)
        a = E[p] if p is not None else 0.0
        b = S[n] if n is not None else t_end
        lo = p + 1 if p is not None else 0
        hi = n if n is not None else len(W)
        span = sum(len(W[k]) for k in range(lo, hi)) or 1
        acc = a + (b - a) * sum(len(W[k]) for k in range(lo, i)) / span
        S[i], E[i] = acc, acc + (b - a) * len(W[i]) / span
    for i in range(1, len(W)):
        S[i] = max(S[i], S[i - 1])
        E[i] = max(E[i], S[i])
    return [dict(t=W[i], s=round(S[i], 3), e=round(E[i], 3)) for i in range(len(W))]


# ------------------------------------------------------------------ engine
def available():
    try:
        import chatterbox  # noqa: F401
        return True
    except ImportError:
        return False


class Engine:
    """Chatterbox and its Whisper judge, loaded on first use and kept; one generation at a time."""

    def __init__(self, device=None, judge="large-v3"):
        self.device, self.judge_name = device, judge
        self.m = self.asr = None
        self.cond_key = None
        self.me_cache = {}
        self.lock = threading.Lock()

    def load(self):
        if self.m is not None:
            return
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        from faster_whisper import WhisperModel
        self.device = self.device or ("cuda" if torch.cuda.is_available() else "cpu")
        log("loading Chatterbox Multilingual V3 on", self.device)
        self.m = ChatterboxMultilingualTTS.from_pretrained(device=self.device, t3_model="v3")
        self._watermark = self.m.watermarker.apply_watermark
        log("loading the Whisper judge", self.judge_name)
        self.asr = WhisperModel(self.judge_name, device=self.device, compute_type="float16" if self.device == "cuda" else "int8")

    def unload(self):
        with self.lock:
            self.m = self.asr = None
            self.cond_key = None
            try:
                import torch
                torch.cuda.empty_cache()
            except Exception:
                pass

    @property
    def loaded(self):
        return self.m is not None

    # -------------------------------------------------------- voice conditioning
    def condition(self, vid, st):
        from chatterbox.models.s3gen import S3GEN_SR
        ref = voices.ref_path(vid)
        if not os.path.exists(ref):
            raise FileNotFoundError(f"voice {vid} has no reference recording yet")
        k = (vid, os.path.getmtime(ref), float(st["exaggeration"]), float(st["decoder_seconds"]))
        if k != self.cond_key:
            self.m.DEC_COND_LEN = int(float(st["decoder_seconds"]) * S3GEN_SR)
            self.m.prepare_conditionals(ref, exaggeration=float(st["exaggeration"]))
            self.cond_key = k

    def me(self, vid):
        """Fingerprint of the real voice: mean speaker embedding of 5 s slices of the reference."""
        ref = voices.ref_path(vid)
        k = (vid, os.path.getmtime(ref))
        if k not in self.me_cache:
            x, _ = audio.load_any(ref, 16000)
            sl = [x[i:i + 80000] for i in range(0, max(1, len(x) - 40000), 80000)]
            e = np.mean([self.m.ve.embeds_from_wavs([s], sample_rate=16000, as_spk=True) for s in sl], axis=0)
            self.me_cache[k] = e / np.linalg.norm(e)
        return self.me_cache[k]

    def heard(self, wav, sr, lang):
        import torch
        import torchaudio
        x = torchaudio.functional.resample(torch.from_numpy(wav), sr, 16000).numpy()
        segs, _ = self.asr.transcribe(x, language=lang, word_timestamps=True, beam_size=5, condition_on_previous_text=False, vad_filter=False)
        return glue([(w.word.strip(), w.start, w.end) for sg in segs for w in sg.words])

    def sim(self, wav, sr, me):
        import torch
        import torchaudio
        x = torchaudio.functional.resample(torch.from_numpy(wav), sr, 16000).numpy()
        return float(np.dot(self.m.ve.embeds_from_wavs([x], sample_rate=16000, as_spk=True), me))

    # -------------------------------------------------------- generation
    def speak(self, text, vid, lang=None, settings=None, tries=3, check=True, seed=0, lexicon=None, progress=None, raw_dir=None, raw_name=None):
        """Text in the voice vid: {"y": float64 48 kHz mono at -20 LUFS, "words": one per text.split(), "report": [...]}.
        tries: draws per sentence (with check, the best one is kept); check=False: first draw, no Whisper."""
        import torch
        import torchaudio
        c = voices.conf(vid)
        st = {**c["voice"], **{k: v for k, v in (settings or {}).items() if v is not None}}
        lang = lang or c.get("lang", "fr")
        lex = merge_lexicons(c["voice"].get("lexicon"), lexicon)
        with self.lock:
            self.load()
            # Perth watermark (inaudible, detectable): on unless the voice turns it off
            self.m.watermarker.apply_watermark = self._watermark if st.get("watermark", True) else (lambda wav, sample_rate: wav)
            self.condition(vid, st)
            me = self.me(vid) if check else None
            sents = sentences(text)
            pieces, words, report, pos = [], [], [], 0.0
            for ci, chunk in enumerate(sents):
                best = None
                n_try = max(1, int(tries))
                for k in range(n_try):
                    if progress:
                        progress(ci, len(sents), k, n_try)
                    torch.manual_seed(1000 * ci + k + seed)
                    w = self.m.generate(say(chunk, lang, lex), language_id=lang, exaggeration=float(st["exaggeration"]),
                                        cfg_weight=float(st["cfg_weight"]), temperature=float(st["temperature"])).squeeze(0).numpy()
                    if not check:
                        best = (0, 0, k, w, [], [], 0, 0, 0, 0)
                        break
                    heard = self.heard(w, self.m.sr, lang)
                    bad, missing, extra, gap, rate = score(chunk, heard, len(w) / self.m.sr, lang)
                    sim = self.sim(w, self.m.sr, me)
                    cand = (bad, -sim, k, w, heard, missing, extra, gap, rate, sim)
                    if best is None or cand[:2] < best[:2]:
                        best = cand
                    if bad == 0 and k >= min(1, n_try - 1):
                        break
                bad, _, k, w, heard, missing, extra, gap, rate, sim = best
                if raw_dir:
                    os.makedirs(raw_dir, exist_ok=True)
                    torchaudio.save(os.path.join(raw_dir, f"{raw_name}-{ci}.wav"), torch.from_numpy(w).float().unsqueeze(0), self.m.sr)
                x, off = trim(w, self.m.sr, heard)
                heard = [(t, s_ - off, e_ - off) for t, s_, e_ in heard]
                y = torchaudio.functional.resample(torch.from_numpy(x).float(), self.m.sr, SR_OUT).numpy()
                words += [dict(t=d["t"], s=round(d["s"] + pos, 3), e=round(d["e"] + pos, 3)) for d in align_words(chunk, heard, lang)]
                pieces.append(y)
                pos += len(y) / SR_OUT
                if ci < len(sents) - 1:
                    p = pause_after(chunk)
                    pieces.append(np.zeros(int(p * SR_OUT), np.float32))
                    pos += p
                report.append(dict(chunk=ci, seed=k, bad=bad, missing=missing, extra=extra, gap=round(gap, 2),
                                   rate=round(rate, 1), sim=round(sim, 3), text=chunk))
        y = loudness_norm(np.concatenate(pieces).astype(np.float64))
        out = {"y": y, "words": words, "report": report, "lang": lang, "settings": st}
        tempo = float(st.get("tempo", 1.0))
        if abs(tempo - 1.0) > 1e-3:
            out = apply_tempo(out, tempo)
        return out


def loudness_norm(y):
    """-20 LUFS, sample peak under -1.5 dBFS (pyloudnorm when present, as the voices were judged with it)."""
    try:
        import pyloudnorm as pyln
        if len(y) > SR_OUT * 0.5:
            y = y * 10 ** ((LUFS - pyln.Meter(SR_OUT).integrated_loudness(y)) / 20)
        pk = np.abs(y).max()
        if pk > 10 ** (-1.5 / 20):
            y = y * 10 ** (-1.5 / 20) / pk
        return y
    except ImportError:
        return audio.normalize(y, SR_OUT, LUFS, -1.5)


def apply_tempo(res, f):
    """WSOLA on the 16-bit file, as the accepted voices were made (write 16-bit, atempo, read back)."""
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
        audio.write_wav16(a, res["y"], SR_OUT)
        audio.atempo(a, b, f)
        x, _ = audio.read_wav(b)
    return {**res, "y": x[:, 0].astype(np.float64), "tempo": f,
            "words": [{**w, "s": round(w["s"] / f, 3), "e": round(w["e"] / f, 3)} for w in res["words"]]}


def save(path, y):
    audio.write_wav16(path, y, SR_OUT)


# ------------------------------------------------------------------ a whole project in one voice
def render(project, vid, out, only=(), resume=True, tries=5, seed=0, log_fn=print, engine=None, progress=None):
    """Every line of a project (or only those ids, in that order) in the voice vid, as a voice track folder:
    <out>/<id>.wav (48 kHz 16-bit, -20 LUFS), durations.json, words.json, report.json; sentences as drawn in <out>/raw/.
    resume: lines already done with the same text, reference and tempo are skipped."""
    eng = engine or Engine()
    c = voices.conf(vid)
    refid = c["voice"].get("ref_id") or vid
    tempo = float(c["voice"].get("tempo", 1.0))
    lex = read_json(os.path.join(project.dir, "lexicon.json"), None)
    os.makedirs(out, exist_ok=True)
    dpath, wpath, rp = (os.path.join(out, f) for f in ("durations.json", "words.json", "report.json"))
    todo = list(project.lines)
    if only:
        order = list(only)
        todo = sorted([ln for ln in todo if ln["id"] in order], key=lambda ln: order.index(ln["id"]))
    report = []
    for i, ln in enumerate(todo):
        lid, text = ln["id"], ln["text"]
        if progress:
            progress(i, len(todo), lid)
        d = read_json(dpath, {}).get(lid, {})
        if resume and d.get("text") == text and d.get("ref") == refid and abs(float(d.get("tempo", 1.0)) - tempo) < 1e-3:
            continue
        t0 = time.time()
        res = eng.speak(text, vid, lang=project.lang, tries=tries, seed=seed, lexicon=lex, raw_dir=os.path.join(out, "raw"), raw_name=lid)
        save(os.path.join(out, f"{lid}.wav"), res["y"])
        assert len(res["words"]) == len(text.split()), (lid, len(res["words"]), len(text.split()))
        durs, wds = read_json(dpath, {}), read_json(wpath, {})      # read again: several processes may fill the same folder
        durs[lid] = dict(text=text, dur=round(len(res["y"]) / SR_OUT, 2), src="clone", voice=vid, ref=refid,
                         **({"tempo": tempo} if abs(tempo - 1) > 1e-3 else {}))
        wds[lid] = res["words"]
        write_json(dpath, durs)
        write_json(wpath, wds, indent=None)
        report += [dict(id=lid, **r) for r in res["report"]]
        worst = max(r["bad"] for r in res["report"])
        log_fn(f"{lid:12s} {len(res['y']) / SR_OUT:5.1f} s  worst sentence: {worst} error(s)  ({time.time() - t0:.0f} s)")
    old = read_json(rp, [])
    done = {r["id"] for r in report}
    write_json(rp, [r for r in old if r.get("id") not in done] + report)
    return out
