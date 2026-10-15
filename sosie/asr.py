"""Speech recognition (faster-whisper): what was said in a take, word by word with timings, aligned on the script."""
import difflib
import os
import threading

from . import audio
from .text import norm
from .util import log


class Transcriber:
    """One Whisper model, loaded on first use. CPU int8 by default: the GPU stays free for the synthesis."""

    def __init__(self, model="large-v3-turbo", device="cpu"):
        self.name, self.device = model, device
        self._model = None
        self._lock = threading.Lock()

    def model(self):
        if self._model is None:
            from faster_whisper import WhisperModel
            log("loading Whisper", self.name, "on", self.device)
            if self.device == "cpu":
                self._model = WhisperModel(self.name, device="cpu", compute_type="int8", cpu_threads=min(16, os.cpu_count() or 4))
            else:
                self._model = WhisperModel(self.name, device=self.device, compute_type="float16")
        return self._model

    def transcribe(self, y16, lang):
        """Recognised words [[word, start, end], …] of a 16 kHz mono signal."""
        with self._lock:
            segs, _ = self.model().transcribe(y16, language=lang, word_timestamps=True, beam_size=5,
                                              condition_on_previous_text=False)
            out = []
            for sg in segs:
                for w in sg.words or []:
                    if out and not w.word.startswith(" "):          # "n" + "'est": continuation of the previous word
                        out[-1][0] += w.word
                        out[-1][2] = round(float(w.end), 3)
                    elif norm(w.word):
                        out.append([w.word.strip(), round(float(w.start), 3), round(float(w.end), 3)])
        return [w for w in out if norm(w[0])]

    def tail_words(self, y, sr, asr, lang):
        """Whisper sometimes drops the last sentence of a take: if voice remains after the last recognised word,
        that end is transcribed on its own (otherwise the trim would cut it from the exported take)."""
        if not asr or len(y) < sr:
            return []
        t, v = audio.voiced(y, sr)
        end = asr[-1][2]
        after = t[v & (t > end + 0.3)]
        if after.size == 0 or after[-1] - after[0] < 0.4:
            return []
        a, b = end, min(len(y) / sr, after[-1] + 0.5)
        more = [[w, round(s + a, 3), round(e + a, 3)] for w, s, e in self.transcribe(audio.to16k(y[int(a * sr):int(b * sr)], sr), lang)]
        if more and norm(more[0][0]) == norm(asr[-1][0]) and more[0][1] < end + 0.2:
            more = more[1:]                               # the end of the last recognised word, heard twice
        return more


def align(tok, asr, dur):
    """Places the script words on the recognised words. st: ok, approx (other spelling), diff (something else said), missing."""
    a, b = [t["n"] for t in tok], [norm(w[0]) for w in asr]
    words = [{"t": t["t"], "s": None, "e": None, "st": "ok"} for t in tok]
    extras = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                words[i1 + k].update(s=asr[j1 + k][1], e=asr[j1 + k][2])
        elif op == "replace":
            s0, e0 = asr[j1][1], asr[j2 - 1][2]
            sim = difflib.SequenceMatcher(None, "".join(a[i1:i2]), "".join(b[j1:j2])).ratio()
            st = "ok" if sim >= 0.9 else "approx" if sim >= 0.75 else "diff"
            L = [max(1, len(x)) for x in a[i1:i2]]
            acc = 0
            for k in range(i2 - i1):
                s = s0 + (e0 - s0) * acc / sum(L)
                acc += L[k]
                words[i1 + k].update(s=round(s, 3), e=round(s0 + (e0 - s0) * acc / sum(L), 3), st=st)
            if st == "diff":
                extras.append({"t": " ".join(w[0] for w in asr[j1:j2]), "s": s0, "e": e0, "at": i1})
        elif op == "delete":
            for k in range(i1, i2):
                words[k]["st"] = "missing"
        else:
            extras.append({"t": " ".join(w[0] for w in asr[j1:j2]), "s": asr[j1][1], "e": asr[j2 - 1][2], "at": i1})
    if not any(w["s"] is not None for w in words):     # nothing recognised: even spread
        for i, w in enumerate(words):
            w["s"] = w["e"] = round(dur * (i + 0.5) / max(1, len(words)), 3)
    last = None                                          # skipped word: where it would have been
    for i, w in enumerate(words):
        if w["s"] is None:
            w["s"] = w["e"] = last if last is not None else next(x["s"] for x in words[i:] if x["s"] is not None)
        last = w["e"]
    ok = sum(w["st"] in ("ok", "approx") for w in words)
    return words, extras, round(ok / max(1, len(words)), 3)
