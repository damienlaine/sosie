"""The voice library: each voice is a folder in <home>/voices/<id>/ holding its reference recording (ref.wav, what the
synthesis imitates) and its synthesis settings. A voice folder is also a recording project (kind "voice"): the sample
sentences of the capture protocol are recorded in the studio like any script, and the reference is built from the kept takes.

Lessons that shaped the protocol (see docs/voice-protocol.md):
- the reference must be in the language the voice will speak: the accent comes from it;
- ~30 s of real speech, given in full to the decoder: much better timbre than the default 10 s;
- the text model only hears the first 6 s: the first sentence sets the tone, read it the way the voice should sound;
- the clone copies the delivery: read calmly and naturally, at the pace you want to hear."""
import os
import shutil
import time

import numpy as np

from . import audio
from . import project as projects
from .util import home, read_json, slug, stamp, write_json

REF_SR = 24000
REF_LEN = 30.0
REF_GAP = 0.35
DEFAULTS = {"engine": "chatterbox-multilingual-v3", "ref": "ref.wav", "exaggeration": 0.35, "cfg_weight": 0.3,
            "temperature": 0.6, "decoder_seconds": 30, "tempo": 1.0, "watermark": True}

PROMPTS = {
    "fr": [
        "Bonjour à toutes et à tous. Aujourd'hui, je vais vous présenter un projet qui nous tient à cœur, et que nous avons construit pas à pas, avec beaucoup de soin.",
        "Le chat gris s'est glissé sous la vieille barque, juste avant que l'orage n'éclate sur le village.",
        "Est-ce que vous avez déjà essayé de résumer une réunion de deux heures en trois phrases ?",
        "Franchement, c'est génial ! On ne s'attendait pas du tout à un tel résultat.",
        "Il faut compter quarante-huit euros, plus trois euros cinquante de frais de port, soit cinquante et un euros cinquante.",
        "Premièrement, on écoute. Deuxièmement, on transcrit. Troisièmement, on vérifie, et seulement ensuite, on publie.",
        "Une bise froide soufflait sur les champs de blé, et les feuilles jaunies tourbillonnaient jusqu'au pont.",
        "Bon, je vais être honnête avec vous : ce n'était pas prévu, mais ça a marché.",
        "Pourquoi choisir entre la qualité et la simplicité, quand on peut avoir les deux ?",
        "Merci de votre attention, et à très bientôt.",
    ],
    "en": [
        "Hello everyone. Today I'd like to walk you through a project we care deeply about, one we built step by step, with a lot of care.",
        "The quick brown fox jumps over the lazy dog, while the old clock in the hallway strikes nine.",
        "Have you ever tried to sum up a two-hour meeting in just three sentences?",
        "Honestly, that's amazing! We really didn't expect results like these.",
        "It costs forty-eight dollars, plus three fifty for shipping, so fifty-one dollars and fifty cents in total.",
        "First, we listen. Second, we transcribe. Third, we check, and only then do we publish.",
        "A cold wind swept across the wheat fields, and yellow leaves whirled all the way to the bridge.",
        "Okay, I'll be honest with you: this wasn't planned, but it worked.",
        "Why choose between quality and simplicity, when you can have both?",
        "Thank you for your attention, and see you very soon.",
    ],
}


def root():
    d = os.path.join(home(), "voices")
    os.makedirs(d, exist_ok=True)
    return d


def vdir(vid):
    if not projects.ID.fullmatch(vid or ""):
        raise KeyError(f"bad voice id: {vid!r}")
    return os.path.join(root(), vid)


def conf(vid):
    c = read_json(os.path.join(vdir(vid), "sosie.json"), None)
    if not c or c.get("kind") != "voice":
        raise KeyError(f"unknown voice: {vid}")
    c["voice"] = {**DEFAULTS, **c.get("voice", {})}
    return c


def ref_path(vid):
    return os.path.join(vdir(vid), conf(vid)["voice"]["ref"])


def summary(vid):
    c = conf(vid)
    v = c["voice"]
    ref = os.path.join(vdir(vid), v["ref"])
    sel = read_json(os.path.join(vdir(vid), "selection.json"), {})
    lines = sum(len(ch.get("lines", [])) for ch in read_json(os.path.join(vdir(vid), "script.json"), {}).get("chapters", []))
    return {"id": vid, "name": c.get("name", vid), "lang": c.get("lang", "fr"), "created": c.get("created"),
            "ref": os.path.exists(ref), "refDur": round(audio.wav_duration(ref), 1) if os.path.exists(ref) else 0,
            "refDate": time.strftime("%Y-%m-%d %H:%M", time.localtime(os.path.getmtime(ref))) if os.path.exists(ref) else None,
            "refFrom": v.get("ref_from"), "settings": {k: v[k] for k in ("exaggeration", "cfg_weight", "temperature", "decoder_seconds", "tempo")},
            "watermark": bool(v.get("watermark", True)),
            "notes": v.get("notes", ""), "takes": len(sel), "prompts": lines}


def list_voices():
    out = []
    for vid in sorted(os.listdir(root())):
        try:
            out.append(summary(vid))
        except (KeyError, OSError, ValueError):
            pass
    return out


def create(name, lang, prompts=None, settings=None):
    """New voice: its folder, its settings and the sentences to read for its samples."""
    base, k = slug(name, 30), 1
    vid = base
    while os.path.exists(vdir(vid)):
        k += 1
        vid = f"{base}-{k}"
    prompts = [p.strip() for p in (prompts or PROMPTS.get(lang) or []) if p.strip()]
    if not prompts:
        raise ValueError(f"no sample sentences for language {lang!r}: write some, in that language")
    chapters = [{"title": "", "lines": [{"id": f"S{i + 1:02d}", "text": t} for i, t in enumerate(prompts)]}]
    projects.create(vdir(vid), name, lang, chapters, kind="voice", extra={"voice": {**DEFAULTS, **(settings or {})}})
    return vid


def update(vid, fields):
    c = read_json(os.path.join(vdir(vid), "sosie.json"), {})
    for k in ("name", "lang"):
        if k in fields and fields[k]:
            c[k] = fields[k]
    v = c.setdefault("voice", {})
    for k in ("exaggeration", "cfg_weight", "temperature", "decoder_seconds", "tempo"):
        if k in fields:
            v[k] = float(fields[k])
    if "watermark" in fields:
        v["watermark"] = bool(fields["watermark"])
    if "notes" in fields:
        v["notes"] = str(fields["notes"])[:2000]
    write_json(os.path.join(vdir(vid), "sosie.json"), c)
    return summary(vid)


def delete(vid):
    """The voice folder goes to <home>/trash (nothing is erased)."""
    conf(vid)
    t = os.path.join(home(), "trash")
    os.makedirs(t, exist_ok=True)
    shutil.move(vdir(vid), os.path.join(t, f"voice-{vid}-{time.strftime('%Y%m%d-%H%M%S')}"))


def _set_ref(vid, y, sr, source):
    """Writes the reference: high-pass 70 Hz, 24 kHz mono, -20 LUFS, the previous one kept as ref-<date>.wav."""
    path = ref_path(vid)
    if os.path.exists(path):
        os.replace(path, os.path.join(vdir(vid), f"ref-{time.strftime('%Y%m%d-%H%M%S', time.localtime(os.path.getmtime(path)))}.wav"))
    tmp = path + ".src.wav"
    audio.write_wav24(tmp, np.clip(y, -1, 1)[:, None], sr)
    tmp2 = path + ".hp.wav"
    audio.ffmpeg("-i", tmp, "-af", "highpass=f=70", "-ar", str(REF_SR), "-ac", "1", "-c:a", "pcm_f32le", tmp2)
    z, _ = audio.read_wav(tmp2)
    z = z[:, 0].astype(np.float64)
    f = int(0.05 * REF_SR)
    if len(z) > 2 * f:
        z[-f:] *= np.linspace(1, 0, f)
    z = audio.normalize(z, REF_SR, -20.0, -1.0)
    audio.write_wav24(path, z[:, None], REF_SR)
    for t in (tmp, tmp2):
        os.remove(t)
    c = read_json(os.path.join(vdir(vid), "sosie.json"), {})
    c.setdefault("voice", {})["ref_from"] = {**source, "date": stamp(), "dur": round(len(z) / REF_SR, 1)}
    c["voice"]["ref_id"] = f"{vid}-{time.strftime('%Y%m%d%H%M%S')}"     # voice tracks made with an older reference are redone
    write_json(os.path.join(vdir(vid), "sosie.json"), c)
    return summary(vid)


def build_ref(vid, segments, noise=None, depth=14, length=REF_LEN, label="takes", project=None):
    """Reference from real takes, in the given order (the first one sets the tone): each take denoised like the studio export,
    cut to its speech, then glued with short gaps up to `length` seconds.
    segments: [{"id", "path", "ch", "trim"}] (Project.kept_takes())."""
    pieces, total, used, sr0 = [], 0.0, [], None
    for s in segments:
        x, sr = audio.read_wav(s["path"])
        if sr0 is None:
            sr0 = sr
        elif sr != sr0:
            continue
        a, b = s["trim"]
        y = x[:, s["ch"]].astype(np.float64)
        if depth and noise:
            y, _ = audio.denoise(y, sr, noise, (0.3, a - 0.25), depth)
        y = y[int(a * sr):int(b * sr)]
        pieces += [y, np.zeros(int(REF_GAP * sr))]
        total += len(y) / sr + REF_GAP
        used.append(s["id"])
        if total >= length:
            break
    if not pieces:
        raise ValueError("no usable take")
    y = np.concatenate(pieces)[: int(length * sr0)]
    return _set_ref(vid, y, sr0, {"kind": label, "takes": used, **({"project": project} if project else {})})


def build_from_own_takes(vid, worker=None, transcriber=None):
    p = projects.Project(vdir(vid), worker, transcriber)
    takes = p.kept_takes()
    if not takes:
        raise ValueError("record and keep at least one sample sentence first")
    return build_ref(vid, takes, noise=p.path("noise"), depth=p.nr_depth(), label="samples")


def import_ref(vid, path, label=None):
    """Reference from an existing recording (any format ffmpeg reads), at most 30 s."""
    y, sr = audio.load_any(path, 48000)
    if len(y) < 5 * sr:
        raise ValueError("recording too short: give at least 5 s of speech (30 s is best)")
    return _set_ref(vid, y[: int(REF_LEN * sr)].astype(np.float64), sr, {"kind": "file", "file": label or os.path.basename(path)})
