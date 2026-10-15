"""Small helpers shared by every module: logging, atomic JSON files, data folders."""
import json
import os
import time

VERSION = "0.1.0"


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, obj, indent=1):
    """Atomic write: readers never see a half-written file."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
    os.replace(tmp, path)


def home():
    """Where voices, generations and the list of recent projects live ($SOSIE_HOME, else ~/.local/share/sosie)."""
    d = os.environ.get("SOSIE_HOME") or os.path.join(os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share"), "sosie")
    os.makedirs(d, exist_ok=True)
    return d


def stamp():
    return time.strftime("%Y-%m-%d %H:%M:%S")


def slug(text, n=40):
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:n].strip("-") or "x"
