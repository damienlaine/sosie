"""A recording project: a folder with a script (lines, optionally grouped in chapters), the takes recorded for each line,
the take kept for each line, and a voice track exported for the edit.

<project>/
  sosie.json        name, language, kind ("script", or "voice" for the reading of a voice's samples), optional film and paths
  script.json       {"chapters": [{"title": …, "lines": [{"id": …, "text": …}]}]}
  timing.json       optional: where each line sits in the reference film {id: {start, dur, vo}}
  takes/<id>/tNN.wav + tNN.json   every take (24-bit), with its analysis: words heard with timings, speech bounds, peaks
  selection.json    the take kept for each line
  settings.json     input channel, denoising depth
  noise.wav         10 s of open-mic silence: the background noise profile
  trash/            discarded takes
  todo.json         optional: lines to record first, in order
  guide/            optional guide voice (for the rythmo band and to fill lines without a take): <id>.wav, durations.json, words.json
  export/           the voice track for the edit: <id>.wav (48 kHz, 16-bit, trimmed, denoised, levelled), durations.json, words.json

Every path can be redirected in sosie.json ("paths"), so an existing production keeps its own layout."""
import itertools
import os
import queue
import re
import shutil
import threading
import time
import traceback

import numpy as np

from . import audio
from .asr import align
from .text import tokens, words_to_tokens
from .util import home, log, read_json, stamp, write_json

ID = re.compile(r"[\w-]+")
TAKE_SRC = ("voix", "take", "synth")   # export entries made from a take (not from the imported synthesis)
NR_LEVELS = (0, 8, 14, 20)
PAUSE_KEEP = 0.08    # s: what is left of a pause that is removed (no pause at all sounds glued)


def pause_cuts(m):
    """Regions to remove from a take (take time, s): each pause longer than the cap is shortened to it, each dropped pause
    to PAUSE_KEEP; the middle of the pause goes, its edges stay."""
    cap, drop = m.get("pause_cap"), {round(s, 2) for s in m.get("pause_drop", [])}
    out = []
    for s, e in m.get("pauses", []):
        keep = PAUSE_KEEP if round(s, 2) in drop else max(PAUSE_KEEP, cap) if cap else None
        if keep is not None and e - s > keep:
            out.append([s + keep / 2, e - keep / 2])
    return out


def removed_before(cuts, t):
    return sum(min(max(t - cs, 0.0), ce - cs) for cs, ce in cuts)      # dB: maximum background-noise reduction (none, light, normal, strong)
DEFAULT_PATHS = {"takes": "takes", "trash": "trash", "noise": "noise.wav", "todo": "todo.json", "guide": "guide",
                 "export": "export", "timing": "timing.json", "guide_words": "guide-words.json"}


class Worker(threading.Thread):
    """One queue for the speech model: takes first, then the guide asked for, then the guide in the background."""

    def __init__(self):
        super().__init__(daemon=True)
        self.q, self.seq = queue.PriorityQueue(), itertools.count()

    def put(self, prio, fn, *args):
        self.q.put((prio, next(self.seq), fn, args))

    def run(self):
        while True:
            _, _, fn, args = self.q.get()
            try:
                fn(*args)
            except Exception:
                traceback.print_exc()


def is_project(path):
    return os.path.isfile(os.path.join(path, "sosie.json"))


def create(path, name, lang, chapters, kind="script", film=None, timing=None, extra=None):
    """New project folder. chapters: [{"title", "lines": [{"id", "text"}]}]."""
    os.makedirs(path, exist_ok=True)
    if is_project(path):
        raise FileExistsError(f"{path} is already a Sosie project")
    ids = [ln["id"] for ch in chapters for ln in ch["lines"]]
    bad = [i for i in ids if not ID.fullmatch(i)]
    if bad or len(set(ids)) != len(ids):
        raise ValueError(f"line ids must be unique and made of letters, digits, - and _: {bad[:5] or 'duplicates'}")
    conf = {"sosie": 1, "kind": kind, "name": name, "lang": lang, "created": stamp(), **(extra or {})}
    if film:
        conf["film"] = os.path.relpath(os.path.abspath(film), path)
    write_json(os.path.join(path, "sosie.json"), conf)
    write_json(os.path.join(path, "script.json"), {"chapters": chapters})
    if timing:
        write_json(os.path.join(path, "timing.json"), timing)
    return path


def recent(add=None, remove=None):
    """Recently opened projects (most recent first)."""
    p = os.path.join(home(), "recent.json")
    lst = [x for x in read_json(p, []) if isinstance(x, str)]
    if add:
        lst = [os.path.abspath(add)] + [x for x in lst if x != os.path.abspath(add)]
    if remove:
        lst = [x for x in lst if x != os.path.abspath(remove)]
    if add or remove:
        write_json(p, lst[:20])
    return [x for x in lst if is_project(x)]


class Project:
    def __init__(self, path, worker, transcriber):
        self.dir = os.path.abspath(path)
        self.work, self.asr = worker, transcriber
        self.lock = threading.RLock()
        self.conf = read_json(self.p("sosie.json"), None)
        if self.conf is None:
            raise FileNotFoundError(f"no sosie.json in {self.dir}")
        self.load_script()
        for d in (self.path("takes"), self.path("trash")):
            os.makedirs(d, exist_ok=True)
        self.sel = read_json(self.p("selection.json"), {})
        self.settings = read_json(self.p("settings.json"), {"channel": "auto"})
        self.gw = read_json(self.path("guide_words"), {})
        self.tk = {}                                       # line -> {n: take metadata}
        self.load_takes()

    # ------------------------------------------------------------ paths and script
    def p(self, *a):
        return os.path.join(self.dir, *a)

    def path(self, key):
        return os.path.normpath(self.p(self.conf.get("paths", {}).get(key, DEFAULT_PATHS[key])))

    @property
    def lang(self):
        return self.conf.get("lang", "fr")

    @property
    def name(self):
        return self.conf.get("name") or os.path.basename(self.dir)

    @property
    def kind(self):
        return self.conf.get("kind", "script")

    def film(self):
        f = self.conf.get("film")
        return os.path.normpath(self.p(f)) if f and os.path.isfile(self.p(f)) else None

    def save_conf(self):
        write_json(self.p("sosie.json"), self.conf)

    def load_script(self):
        sc = read_json(self.p("script.json"), {"chapters": []})
        chapters = sc.get("chapters") or [{"title": "", "lines": sc.get("lines", [])}]
        self.chapters, self.lines = [], []
        for ci, ch in enumerate(chapters):
            self.chapters.append({"num": ci, "title": ch.get("title", "")})
            for ln in ch.get("lines", []):
                self.lines.append({"id": ln["id"], "ch": ci, "text": ln["text"], **({"note": ln["note"]} if ln.get("note") else {})})
        self.byid = {ln["id"]: ln for ln in self.lines}
        self.timing = read_json(self.path("timing"), {})

    # ------------------------------------------------------------ editing the script, the video and the timing
    def save_script(self):
        """script.json from the lines in memory (the previous one kept as script.json.bak); chapters keep their titles."""
        if os.path.exists(self.p("script.json")):
            shutil.copy2(self.p("script.json"), self.p("script.json.bak"))
        chapters = [{"title": ch["title"], "lines": [{k: ln[k] for k in ("id", "text", "note") if ln.get(k)}
                                                     for ln in self.lines if ln["ch"] == ch["num"]]} for ch in self.chapters]
        write_json(self.p("script.json"), {"chapters": chapters})
        self.load_script()

    def new_id(self):
        """L001, L002…: never an id already used, nor one whose takes folder still exists (a deleted line keeps its takes)."""
        used = set(self.byid) | set(os.listdir(self.path("takes")))
        k = 1 + max([int(m[1]) for i in used if (m := re.fullmatch(r"L(\d+)", i))], default=0)
        while f"L{k:03d}" in used:
            k += 1
        return f"L{k:03d}"

    def edit_line(self, lid, text):
        text = " ".join(text.split())
        if not text:
            raise ValueError("empty line")
        with self.lock:
            self.byid[lid]["text"] = text
            self.save_script()

    def add_line(self, after, text):
        """A new line after the line `after` (in its chapter), or at the end."""
        text = " ".join(text.split())
        if not text:
            raise ValueError("empty line")
        with self.lock:
            lid = self.new_id()
            i = next((k + 1 for k, ln in enumerate(self.lines) if ln["id"] == after), len(self.lines))
            ch = self.lines[i - 1]["ch"] if i else (self.chapters[0]["num"] if self.chapters else 0)
            if not self.chapters:
                self.chapters = [{"num": 0, "title": ""}]
            self.lines.insert(i, {"id": lid, "ch": ch, "text": text})
            self.save_script()
            return lid

    def delete_line(self, lid):
        """The line leaves the script; its takes stay in takes/<id>/, its exported file goes to the trash."""
        with self.lock:
            self.lines = [ln for ln in self.lines if ln["id"] != lid]
            self.save_script()
            if self.sel.pop(lid, None) is not None:
                self.save_sel()
            exp = self.path("export")
            dpath, wpath = os.path.join(exp, "durations.json"), os.path.join(exp, "words.json")
            meta, words = read_json(dpath, {}), read_json(wpath, {})
            if lid in meta or lid in words:
                meta.pop(lid, None)
                words.pop(lid, None)
                write_json(dpath, meta)
                write_json(wpath, words)
            if os.path.exists(os.path.join(exp, lid + ".wav")):
                shutil.move(os.path.join(exp, lid + ".wav"), os.path.join(self.path("trash"), f"export-{lid}-{time.strftime('%Y%m%d-%H%M%S')}.wav"))
            if lid in self.timing:
                self.timing.pop(lid)
                write_json(self.path("timing"), self.timing)

    def set_film(self, path):
        with self.lock:
            if path:
                path = os.path.abspath(os.path.expanduser(path))
                if not os.path.isfile(path):
                    raise FileNotFoundError(path)
                self.conf["film"] = os.path.relpath(path, self.dir)
            else:
                self.conf.pop("film", None)
            self.save_conf()

    def set_timing(self, upd, remove=()):
        """Where lines sit in the video: {id: {"start", "dur", "vo"}} merged into timing.json."""
        with self.lock:
            for lid, tm in upd.items():
                if lid in self.byid:
                    self.timing[lid] = {k: round(float(tm[k]), 3) for k in ("start", "dur", "vo")}
            for lid in remove:
                self.timing.pop(lid, None)
            write_json(self.path("timing"), self.timing)

    def set_pace(self, lid, wpm):
        """Speaking rate (words per minute) used to estimate the rythmo band: of one line, or the project's default (lid None)."""
        with self.lock:
            pace = self.settings.setdefault("pace", {})
            v = round(min(400.0, max(40.0, float(wpm))), 1) if wpm else None
            if lid is None:
                pace["default"] = v
            else:
                lines = pace.setdefault("lines", {})
                if v:
                    lines[lid] = v
                else:
                    lines.pop(lid, None)
            write_json(self.p("settings.json"), self.settings)

    # ------------------------------------------------------------ takes
    def take_path(self, lid, n, ext="wav"):
        return os.path.join(self.path("takes"), lid, f"t{n:02d}.{ext}")

    def save_meta(self, lid, n):
        write_json(self.take_path(lid, n, "json"), self.tk[lid][n])

    def save_sel(self):
        write_json(self.p("selection.json"), self.sel)

    def load_takes(self):
        for ln in self.lines:
            d = os.path.join(self.path("takes"), ln["id"])
            if not os.path.isdir(d):
                continue
            for f in sorted(os.listdir(d)):
                if re.fullmatch(r"t\d+\.json", f):
                    m = read_json(os.path.join(d, f), None)
                    if m and os.path.exists(os.path.join(d, m["file"])):
                        self.tk.setdefault(ln["id"], {})[m["n"]] = m

    def resume(self):
        """Analyses interrupted by a restart, and the guide words, are queued again."""
        for lid, takes in self.tk.items():
            for n, m in takes.items():
                if m.get("status") == "analyse" or (m.get("status") == "ok" and "heard" not in m):
                    self.work.put(0, self.analyse, lid, n)
        for ln in self.lines:
            self.work.put(2, self.guide_words, ln["id"])

    def next_n(self, lid):
        d, trash = os.path.join(self.path("takes"), lid), self.path("trash")
        used = [int(m[1]) for f in os.listdir(d) if (m := re.fullmatch(r"t(\d+)\.wav", f))]
        used += [int(m[1]) for f in os.listdir(trash) if (m := re.fullmatch(rf"{re.escape(lid)}-t(\d+)-.*\.wav", f))]
        return max(used, default=0) + 1

    def new_take(self, lid, body, info):
        with self.lock:
            os.makedirs(os.path.join(self.path("takes"), lid), exist_ok=True)
            n = self.next_n(lid)
            with open(self.take_path(lid, n), "wb") as f:
                f.write(body)
            try:
                info = dict(info, source=audio.dual_mono(self.take_path(lid, n), self.settings.get("channel", "auto")))
            except Exception:
                traceback.print_exc()
            self.tk.setdefault(lid, {})[n] = {"n": n, "file": f"t{n:02d}.wav", "created": stamp(),
                                              "text": self.byid[lid]["text"], "status": "analyse", "rec": info}
            self.save_meta(lid, n)
            self.sel[lid] = n                          # the latest take is kept by default
            self.save_sel()
        log(f"{lid} take {n} received ({len(body) / 1e6:.1f} MB)")
        self.work.put(0, self.analyse, lid, n)
        return self.tk[lid][n]

    def analyse(self, lid, n):
        with self.lock:
            m = self.tk.get(lid, {}).get(n)
        if not m:
            return
        t0 = time.time()
        try:
            x, sr = audio.read_wav(self.take_path(lid, n))
            ch = audio.pick_channel(x, self.settings.get("channel", "auto"))
            y = x[:, ch]
            asr = self.asr.transcribe(audio.to16k(y, sr), self.lang)
            asr += self.asr.tail_words(y, sr, asr, self.lang)
            peak = float(np.abs(y).max()) if len(y) else 0.0
            trim = audio.speech_bounds(y, sr, asr)
            upd = dict(status="ok", ch=ch, channels=int(x.shape[1]), sr=sr, dur=round(len(y) / sr, 3),
                       trim=trim, pauses=audio.find_pauses(y, sr, *trim), peaks=audio.peaks(y),
                       peak_db=round(20 * np.log10(peak + 1e-9), 1), clips=int((np.abs(y) >= audio.CLIP).sum()),
                       heard=[{"t": w, "s": a, "e": b} for w, a, b in asr], asr=" ".join(w[0] for w in asr))
        except Exception as e:
            traceback.print_exc()
            upd = dict(status="erreur", error=str(e)[:300])
        with self.lock:
            if n not in self.tk.get(lid, {}):
                return                                 # discarded during the analysis
            self.tk[lid][n].update(upd)
            self.save_meta(lid, n)
            log(f"{lid} take {n} analysed in {time.time() - t0:.1f} s: {upd.get('asr', '')[:60]}")
            if self.sel.get(lid) == n:
                self.export(lid)

    def discard(self, lid, n):
        with self.lock:
            m = self.tk.get(lid, {}).pop(n, None)
            if not m:
                return
            st = time.strftime("%Y%m%d-%H%M%S")
            for ext in ("wav", "json"):
                p = self.take_path(lid, n, ext)
                if os.path.exists(p):
                    shutil.move(p, os.path.join(self.path("trash"), f"{lid}-t{n:02d}-{st}.{ext}"))
            if self.sel.get(lid) == n:
                rest = [k for k, v in self.tk.get(lid, {}).items() if v.get("status") != "erreur"]
                if rest:
                    self.sel[lid] = max(rest)
                else:
                    self.sel.pop(lid, None)
                self.save_sel()
                self.export(lid)
        log(f"{lid} take {n} discarded")

    def select(self, lid, n):
        with self.lock:
            if n is None:
                self.sel.pop(lid, None)
            elif n in self.tk.get(lid, {}):
                self.sel[lid] = n
            self.save_sel()
            self.export(lid)

    # ------------------------------------------------------------ export to the edit
    def nr_depth(self):
        d = self.settings.get("denoise", 14)
        return d if d in NR_LEVELS else 14

    def export(self, lid):
        """Puts the kept take of the line (or, failing that, the imported synthesis) in the export folder.
        A microphone take is trimmed, denoised, compressed gently and levelled; a synthetic take is only levelled.
        Both are sped up or slowed down by their tempo (WSOLA), word timings included."""
        exp = self.path("export")
        os.makedirs(exp, exist_ok=True)
        with self.lock:
            n = self.sel.get(lid)
            m = self.tk.get(lid, {}).get(n)
            dpath, wpath = os.path.join(exp, "durations.json"), os.path.join(exp, "words.json")
            meta, words = read_json(dpath, {}), read_json(wpath, {})
            out = os.path.join(exp, lid + ".wav")
            if m is None:
                if meta.get(lid, {}).get("src") in TAKE_SRC:
                    gmeta = self.guide_meta().get(lid)
                    gwav = os.path.join(self.path("guide"), lid + ".wav")
                    if gmeta and os.path.exists(gwav) and os.path.realpath(gwav) != os.path.realpath(out):
                        shutil.copy2(gwav, out)
                        meta[lid] = gmeta
                        gw = read_json(os.path.join(self.path("guide"), "words.json"), {}).get(lid)
                        if gw:
                            words[lid] = gw
                        else:
                            words.pop(lid, None)
                        log(f"{lid}: back to the imported synthesis")
                    else:
                        meta.pop(lid, None)
                        words.pop(lid, None)
                        if os.path.exists(out):
                            os.remove(out)
                    write_json(dpath, meta)
                    write_json(wpath, words)
                return
            if m.get("status") != "ok":
                return                                 # exported at the end of the analysis
            a, b = m["trim"]
            f = float(m.get("tempo", 1.0))
            tempo = f"atempo={f}," if abs(f - 1) > 1e-3 else ""
            cuts = pause_cuts(m)
            d = (b - a - sum(ce - cs for cs, ce in cuts)) / f
            tmp = [os.path.join(exp, f".export-{k}.wav") for k in range(5)]
            src, ch, nr = self.take_path(lid, n), m["ch"], None
            target = float(self.conf.get("export", {}).get("lufs", -20.0))
            synth = m.get("kind") == "synth"
            depth = 0 if synth else self.nr_depth()
            if depth:
                x, sr = audio.read_wav(src)
                y, nr = audio.denoise(x[:, ch], sr, self.path("noise"), (0.3, a - 0.25), depth)
                if nr is not None:
                    audio.write_wav24(tmp[0], y[:, None], sr)
                    src, ch = tmp[0], 0
            if cuts:                                   # shortened pauses: the speech span without them, then as usual
                x, sr = audio.read_wav(src)
                y = audio.cut(x[int(a * sr):int(b * sr), ch].astype(np.float64), sr, [[cs - a, ce - a] for cs, ce in cuts])
                audio.write_wav24(tmp[4], y[:, None], sr)
                src, ch, a, b = tmp[4], 0, 0.0, len(y) / sr
            if synth:                                  # already trimmed and clean: tempo, then level
                audio.ffmpeg("-i", src, "-af", f"pan=mono|c0=c{ch},{tempo}anull", "-c:a", "pcm_f32le", tmp[2])
            else:
                audio.ffmpeg("-i", src, "-af",
                             f"pan=mono|c0=c{ch},atrim={a}:{b},asetpts=PTS-STARTPTS,{tempo}highpass=f=70,"
                             f"afade=t=in:d=0.02,afade=t=out:st={max(0.0, d - 0.08):.3f}:d=0.08", "-c:a", "pcm_f32le", tmp[1])
                i1, _ = audio.loudness(tmp[1])
                g1 = target - i1 if i1 > -70 else 0.0
                audio.ffmpeg("-i", tmp[1], "-af", f"volume={g1:.2f}dB,acompressor=threshold=0.126:ratio=2:attack=10:release=150",
                             "-c:a", "pcm_f32le", tmp[2])
            i2, p2 = audio.loudness(tmp[2])
            g2 = min(target - i2 if i2 > -70 else 0.0, -1.5 - p2)
            audio.ffmpeg("-i", tmp[2], "-af", f"volume={g2:.2f}dB", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", tmp[3])
            os.replace(tmp[3], out)
            for t in tmp[:3] + tmp[4:]:
                if os.path.exists(t):
                    os.remove(t)
            dur = audio.wav_duration(out)
            meta[lid] = {"text": self.byid[lid]["text"], "dur": round(dur, 2),
                         "src": "synth" if synth else self.conf.get("export", {}).get("src", "take"),
                         "take": n, "denoise": depth if nr is not None else 0, "at": time.strftime("%H%M%S"),
                         **({"voice": m.get("voice")} if synth else {}), **({"tempo": f} if tempo else {}),
                         **({"cut": round(sum(ce - cs for cs, ce in cuts), 2)} if cuts else {})}
            a0 = m["trim"][0]
            at = lambda t: max(0.0, t - a0 - removed_before([[cs - a0, ce - a0] for cs, ce in cuts], max(0.0, t - a0))) / f  # noqa: E731
            words[lid] = [{"t": w["t"], "s": round(at(w["s"]), 3), "e": round(at(w["e"]), 3)} for w in m["heard"]]
            write_json(dpath, meta)
            write_json(wpath, words)
            log(f"{lid}: {'synthetic ' if synth else ''}take {n} exported ({dur:.2f} s" + (f", tempo ×{f}" if tempo else "")
                + (f", pauses −{sum(ce - cs for cs, ce in cuts):.2f} s" if cuts else "")
                + (f", denoised -{depth} dB, profile {nr:+.1f} dB)" if nr is not None else ")"))

    def set_tempo(self, lid, n, f):
        """Speeds the take up (f > 1, shorter) or slows it down (f < 1, longer) in the export, pitch unchanged."""
        with self.lock:
            m = self.tk.get(lid, {}).get(n)
            if not m:
                raise LookupError("unknown take")
            m["tempo"] = round(min(1.4, max(0.7, float(f))), 3)
            if abs(m["tempo"] - 1) < 1e-3:
                m.pop("tempo")
            self.save_meta(lid, n)
            if self.sel.get(lid) == n:
                self.export(lid)
            return m

    def ensure_pauses(self, lid):
        """Pauses of the takes analysed before pause detection existed."""
        changed = False
        for n, m in list(self.tk.get(lid, {}).items()):
            if m.get("status") == "ok" and "pauses" not in m:
                x, sr = audio.read_wav(self.take_path(lid, n))
                with self.lock:
                    m["pauses"] = audio.find_pauses(x[:, m.get("ch", 0)], sr, *m["trim"])
                    self.save_meta(lid, n)
                changed = True
        return changed

    def set_pauses(self, lid, n, cap=False, toggle=None):
        """cap: longest pause kept, in seconds (None: pauses untouched; False: unchanged). toggle: start of a pause to remove
        (or to restore if it was removed)."""
        with self.lock:
            m = self.tk.get(lid, {}).get(n)
            if not m:
                raise LookupError("unknown take")
            if cap is not False:
                if cap:
                    m["pause_cap"] = round(max(PAUSE_KEEP, float(cap)), 3)
                else:
                    m.pop("pause_cap", None)
            if toggle is not None:
                drop = [round(s, 2) for s in m.get("pause_drop", [])]
                k = round(float(toggle), 2)
                drop = [s for s in drop if s != k] if k in drop else drop + [k]
                if drop:
                    m["pause_drop"] = sorted(drop)
                else:
                    m.pop("pause_drop", None)
            self.save_meta(lid, n)
            if self.sel.get(lid) == n:
                self.export(lid)
            return m

    def new_synth_take(self, lid, res, vid, voice_name):
        """A take made by the synthesis (tts.Engine.speak result): saved and listed like a microphone take.
        It is kept for the track only if the line has no kept take yet. Returns (metadata, kept)."""
        y = np.asarray(res["y"], np.float64)
        sr = 48000
        with self.lock:
            os.makedirs(os.path.join(self.path("takes"), lid), exist_ok=True)
            n = self.next_n(lid)
            audio.write_wav24(self.take_path(lid, n), y[:, None], sr)
            dur = round(len(y) / sr, 3)
            peak = float(np.abs(y).max()) if len(y) else 0.0
            text = self.byid[lid]["text"]
            m = {"n": n, "file": f"t{n:02d}.wav", "created": stamp(), "text": text, "status": "ok", "kind": "synth",
                 "voice": vid, "voiceName": voice_name, "settings": {k: res["settings"].get(k) for k in
                 ("exaggeration", "cfg_weight", "temperature", "decoder_seconds", "tempo")},
                 "ch": 0, "channels": 1, "sr": sr, "dur": dur, "trim": [0.0, dur], "peaks": audio.peaks(y),
                 "pauses": audio.find_pauses(y, sr, 0.0, dur),
                 "peak_db": round(20 * np.log10(peak + 1e-9), 1), "clips": 0,
                 "heard": [{"t": w["t"], "s": w["s"], "e": w["e"]} for w in res["words"]], "asr": text,
                 "worst": max((r["bad"] for r in res["report"]), default=0), "report": res["report"]}
            self.tk.setdefault(lid, {})[n] = m
            self.save_meta(lid, n)
            kept = self.sel.get(lid) not in self.tk.get(lid, {})
            if kept:
                self.sel[lid] = n
                self.save_sel()
                self.export(lid)
        log(f"{lid}: synthetic take {n} ({voice_name}, {dur:.1f} s)" + (", kept" if kept else ""))
        return m, kept

    def lexicon(self):
        return read_json(self.p("lexicon.json"), None)

    def export_all(self):
        """After a change of denoising or noise profile: every kept take again (the lock is released in between)."""
        for lid in list(self.sel):
            with self.lock:
                ok = self.sel.get(lid) in self.tk.get(lid, {})
            if ok:
                self.export(lid)

    def export_version(self, lid):
        """Version of the exported file (to listen to the processed take), if it is a real take."""
        m = read_json(os.path.join(self.path("export"), "durations.json"), {}).get(lid, {})
        return f'{m.get("take")}-{m.get("denoise")}-{m.get("at")}' if m.get("src") in TAKE_SRC else None

    # ------------------------------------------------------------ noise profile and settings
    def save_noise(self, body):
        path = self.path("noise")
        tmp = path + ".tmp"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(tmp, "wb") as f:
            f.write(body)
        audio.dual_mono(tmp)
        os.replace(tmp, path)
        log("new background noise profile")
        self.work.put(0, self.export_all)

    def noise_state(self):
        path = self.path("noise")
        if not os.path.exists(path):
            return None
        return {"date": time.strftime("%d/%m %H:%M", time.localtime(os.path.getmtime(path))), "dur": round(audio.wav_duration(path), 1)}

    def update_settings(self, upd):
        with self.lock:
            old = self.nr_depth()
            self.settings.update({k: v for k, v in upd.items() if k in ("channel", "denoise")})
            write_json(self.p("settings.json"), self.settings)
            if self.nr_depth() != old:
                self.work.put(0, self.export_all)
        return {**self.settings, "denoise": self.nr_depth()}

    # ------------------------------------------------------------ guide voice
    def guide_meta(self):
        return read_json(os.path.join(self.path("guide"), "durations.json"), {})

    def guide_words(self, lid):
        """Word timings of the guide voice: from the guide's words.json when it matches the text, else from Whisper (cached)."""
        gm = self.guide_meta().get(lid)
        wav = os.path.join(self.path("guide"), lid + ".wav")
        if not gm or not os.path.exists(wav) or self.gw.get(lid, {}).get("text") == gm["text"]:
            return
        ws = words_to_tokens(gm["text"], read_json(os.path.join(self.path("guide"), "words.json"), {}).get(lid))
        if ws is None:
            x, sr = audio.read_wav(wav)
            y = x[:, 0]
            ws, _, _ = align(tokens(gm["text"]), self.asr.transcribe(audio.to16k(y, sr), self.lang), len(y) / sr)
        with self.lock:
            self.gw[lid] = {"text": gm["text"], "words": [{"t": w["t"], "s": w["s"], "e": w["e"]} for w in ws]}
            write_json(self.path("guide_words"), self.gw)

    # ------------------------------------------------------------ state for the page
    def line_state(self, ln, gmeta=None):
        lid = ln["id"]
        gm = (self.guide_meta() if gmeta is None else gmeta).get(lid, {})
        gw = self.gw.get(lid)
        tm = self.timing.get(lid)
        return {**ln, "tok": tokens(ln["text"]), "film": tm,
                "slot": round(tm["start"] + tm["dur"] - tm["vo"], 2) if tm and "vo" in tm else None,
                "gdur": gm.get("dur"), "gtext": gm.get("text"),
                "guide": gw["words"] if gw and gw["text"] == gm.get("text") == ln["text"] else None,
                "takes": [self.tk[lid][n] for n in sorted(self.tk.get(lid, {}))], "sel": self.sel.get(lid),
                "export": self.export_version(lid)}

    def summary(self):
        return {"dir": self.dir, "name": self.name, "lang": self.lang, "kind": self.kind, "lines": len(self.lines),
                "voice": self.conf.get("voice")}

    def state(self):
        with self.lock:
            gm = self.guide_meta()
            film = self.film()
            return {"project": self.summary(), "chapters": self.chapters,
                    "settings": {**self.settings, "denoise": self.nr_depth()}, "noise": self.noise_state(),
                    "film": "/film" if film else None, "filmName": self.conf.get("film"), "filmPath": film,
                    "scriptFrom": self.conf.get("script_from"),
                    "guideVoice": self.conf.get("guide_voice"),
                    "paths": {k: self.path(k) for k in ("takes", "export", "guide", "noise")},
                    "todo": read_json(self.path("todo"), []),
                    "lines": [self.line_state(ln, gm) for ln in self.lines]}

    def kept_takes(self, ids=None):
        """(take path, channel, trim) of the kept takes, in script order (or in the order of ids)."""
        out = []
        for lid in ids or [ln["id"] for ln in self.lines]:
            n = self.sel.get(lid)
            m = self.tk.get(lid, {}).get(n)
            if m and m.get("status") == "ok":
                out.append({"id": lid, "path": self.take_path(lid, n), "ch": m["ch"], "trim": m["trim"]})
        return out
