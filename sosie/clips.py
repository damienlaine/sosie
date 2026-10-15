"""Audio clips made in the synthesis panel: <home>/clips/<id>.wav + <id>.json, and the system clipboard."""
import os
import shutil
import subprocess
import time

from . import tts
from .util import home, read_json, slug, stamp, write_json


def root():
    d = os.path.join(home(), "clips")
    os.makedirs(d, exist_ok=True)
    return d


def path(cid, ext="wav"):
    return os.path.join(root(), f"{cid}.{ext}")


def add(res, text, vid, voice_name):
    cid = f"{time.strftime('%Y%m%d-%H%M%S')}-{slug(voice_name, 16)}-{slug(text, 28)}"
    tts.save(path(cid), res["y"])
    meta = {"id": cid, "text": text, "voice": vid, "voiceName": voice_name, "lang": res["lang"], "created": stamp(),
            "dur": round(len(res["y"]) / tts.SR_OUT, 2), "settings": {k: res["settings"].get(k) for k in
            ("exaggeration", "cfg_weight", "temperature", "decoder_seconds", "tempo")},
            "words": res["words"], "worst": max((r["bad"] for r in res["report"]), default=0), "report": res["report"]}
    write_json(path(cid, "json"), meta)
    return meta


def list_clips(limit=200):
    out = []
    for f in sorted(os.listdir(root()), reverse=True):
        if f.endswith(".json"):
            m = read_json(os.path.join(root(), f), None)
            if m and os.path.exists(path(m["id"])):
                out.append({k: v for k, v in m.items() if k not in ("words", "report")})
        if len(out) >= limit:
            break
    return out


def delete(cid):
    t = os.path.join(home(), "trash")
    os.makedirs(t, exist_ok=True)
    for ext in ("wav", "json"):
        if os.path.exists(path(cid, ext)):
            shutil.move(path(cid, ext), os.path.join(t, f"clip-{cid}.{ext}"))


def save_as(cid, dest):
    dest = os.path.expanduser(dest)
    if os.path.isdir(dest):
        dest = os.path.join(dest, f"{cid}.wav")
    shutil.copy2(path(cid), dest)
    return dest


def copy_to_clipboard(file_path):
    """Puts the file in the clipboard as a file (text/uri-list): it pastes into a file manager, a chat, an editor's media bin."""
    uri = "file://" + os.path.abspath(file_path)
    if os.environ.get("WAYLAND_DISPLAY") and shutil.which("wl-copy"):
        subprocess.Popen(["wl-copy", "--type", "text/uri-list", uri + "\r\n"], stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        return "wl-copy"
    if os.environ.get("DISPLAY") and shutil.which("xclip"):
        p = subprocess.Popen(["xclip", "-selection", "clipboard", "-t", "text/uri-list"], stdin=subprocess.PIPE,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        p.stdin.write((uri + "\r\n").encode())
        p.stdin.close()
        return "xclip"
    if shutil.which("pbcopy"):                      # macOS: the path as text
        subprocess.run(["pbcopy"], input=os.path.abspath(file_path).encode(), check=True)
        return "pbcopy"
    raise RuntimeError("no clipboard tool found (wl-copy or xclip)")
