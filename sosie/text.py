"""Script words: display tokens for the rythmo band and normalised forms to compare a script with what was heard."""
import re
import unicodedata

PUNCT_END = re.compile(r"[.!?…:;]$")
TAG = re.compile(r"\[[a-z_]+\]")      # paralinguistic tags of the synthesis ([sigh], [laughter]…): not words


def norm(w):
    w = unicodedata.normalize("NFKD", w.lower().replace("œ", "oe").replace("æ", "ae"))
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in w if not unicodedata.combining(c)))


def strip_tags(text):
    return re.sub(r"\s+", " ", TAG.sub(" ", text)).strip()


def tokens(text):
    """Script words: t displayed (isolated punctuation glued to its neighbour), n normalised, p end of sentence."""
    out, pre = [], ""
    for raw in strip_tags(text).split():
        if not norm(raw):
            if raw[0] in "«(“[":
                pre += raw + " "
            elif out:
                out[-1]["t"] += " " + raw
                out[-1]["p"] = out[-1]["p"] or bool(PUNCT_END.search(raw))
            continue
        out.append({"t": pre + raw, "n": norm(raw), "p": bool(PUNCT_END.search(raw.rstrip("»)”\"")))})
        pre = ""
    return out


def words_to_tokens(text, words):
    """Per-word timings of text.split() (a voice-track words.json) mapped onto tokens(text), or None if they do not match."""
    raw = strip_tags(text).split()
    if not words or len(words) != len(raw):
        return None
    return [{"t": w["t"], "s": w["s"], "e": w["e"]} for r, w in zip(raw, words) if norm(r)]
