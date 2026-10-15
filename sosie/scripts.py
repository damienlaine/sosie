"""Script import: plain text or Markdown (one paragraph per line, "# Title" starts a chapter, "[ID] text" names a line),
SRT subtitles (one cue per line, with its timing: dubbing on a video), or Sosie's own JSON."""
import json
import os
import re

from .project import ID


def _ts(t):
    h, m, s = t.replace(",", ".").split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def parse_srt(text):
    chapters, timing = [{"title": "", "lines": []}], {}
    for block in re.split(r"\n\s*\n", text.replace("\r", "").strip()):
        rows = block.strip().split("\n")
        k = next((i for i, r in enumerate(rows) if "-->" in r), None)
        if k is None:
            continue
        a, b = (_ts(x.strip().split()[0]) for x in rows[k].split("-->"))
        body = " ".join(re.sub(r"<[^>]+>", "", r).strip() for r in rows[k + 1:] if r.strip())
        if not body:
            continue
        lid = f"L{len(chapters[0]['lines']) + 1:03d}"
        chapters[0]["lines"].append({"id": lid, "text": body})
        timing[lid] = {"start": round(a, 3), "dur": round(b - a, 3), "vo": round(a, 3)}
    return chapters, timing


def parse_text(text):
    chapters, n = [], 0
    cur = {"title": "", "lines": []}
    for para in re.split(r"\n\s*\n", text.replace("\r", "").strip()):
        para = para.strip()
        if not para:
            continue
        if m := re.fullmatch(r"#{1,3}\s+(.+)", para.split("\n")[0]):
            if cur["lines"] or cur["title"]:
                chapters.append(cur)
            cur = {"title": m[1].strip(), "lines": []}
            para = "\n".join(para.split("\n")[1:]).strip()
            if not para:
                continue
        body = " ".join(x.strip() for x in para.split("\n"))
        n += 1
        lid = f"L{n:03d}"
        if (m := re.match(r"\[([\w-]+)\]\s*(.+)", body)) and ID.fullmatch(m[1]):
            lid, body = m[1], m[2]
        cur["lines"].append({"id": lid, "text": body})
    if cur["lines"] or cur["title"]:
        chapters.append(cur)
    return chapters, None


def parse(text, fmt=None, name=""):
    """(chapters, timing or None) from a script file's content; fmt: srt, json, txt, md (default: from the name)."""
    fmt = fmt or os.path.splitext(name)[1].lstrip(".").lower() or "txt"
    if fmt == "srt" or (fmt == "txt" and "-->" in text[:400]):
        return parse_srt(text)
    if fmt == "json":
        d = json.loads(text)
        return d.get("chapters") or [{"title": "", "lines": d["lines"]}], d.get("timing")
    return parse_text(text)
