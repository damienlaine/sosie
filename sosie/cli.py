"""Command line.

  sosie [PROJECT]                         the studio in the browser (last project if none given)
  sosie setup                             download the models and create the demo project (run once)
  sosie demo                              the studio on the demo project
  sosie init DIR --script FILE            new project from a script (.txt/.md paragraphs, .srt cues, .json)
  sosie say "text" --voice ID             a sentence in a library voice, to a WAV file
  sosie render PROJECT --voice ID         every line of a project in a voice (a voice track folder)
  sosie tempo SRC DST FACTOR              speed a voice track folder up or down (WSOLA), word timings included
  sosie voice list | add | import | from-project
"""
import argparse
import json
import locale
import os
import shutil
import subprocess
import sys
import urllib.request
import webbrowser

from .util import VERSION, read_json, write_json

COMMANDS = ("studio", "setup", "demo", "init", "say", "render", "tempo", "voice")
EXAMPLES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "examples")
CHATTERBOX_FILES = ["ve.pt", "t3_mtl23ls_v3.safetensors", "s3gen.pt", "grapheme_mtl_merged_expanded_v1.json", "conds.pt", "Cangjie5_TC.json"]


def open_browser(url):
    chrome = next((c for c in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser") if shutil.which(c)), None)
    if chrome:          # app window: no tabs, and the microphone permission is remembered for localhost
        subprocess.Popen([chrome, f"--app={url}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    else:
        webbrowser.open(url)


def running(port):
    """The Sosie already serving on this port, if any."""
    try:
        with urllib.request.urlopen(f"http://localhost:{port}/api/app", timeout=1) as r:
            return json.load(r)
    except Exception:
        return None


def cmd_studio(a):
    url = f"http://localhost:{a.port}"
    if running(a.port):                         # already running: just show it (on the project asked for)
        if a.project:
            req = urllib.request.Request(f"{url}/api/project/open", data=json.dumps({"dir": os.path.abspath(a.project)}).encode(),
                                         headers={"X-Sosie": "1"}, method="POST")
            urllib.request.urlopen(req, timeout=10).read()
        print(f"Sosie is already running: {url}")
        if not a.no_browser:
            open_browser(url)
        return
    from .server import serve
    srv = serve(a.port, a.project, a.whisper, a.device)
    if not a.no_browser:
        open_browser(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


def default_lang():
    loc = (os.environ.get("LANG") or locale.getlocale()[0] or "en").lower()
    return "fr" if loc.startswith("fr") else "en"


def demo_project(lang):
    """~/sosie/demo-<lang>: a five-line project that walks through the studio (created once)."""
    from . import project, scripts
    path = os.path.join(os.path.expanduser("~"), "sosie", f"demo-{lang}")
    if not project.is_project(path):
        with open(os.path.join(EXAMPLES, f"demo.{lang}.md"), encoding="utf-8") as f:
            chapters, timing = scripts.parse(f.read(), "md")
        project.create(path, "Démo" if lang == "fr" else "Demo", lang, chapters, timing=timing)
    return path


def cmd_setup(a):
    """Downloads the models into the Hugging Face cache (~/.cache/huggingface) and creates the demo project."""
    from faster_whisper.utils import download_model
    from . import tts
    print("1/3  speech recognition for the takes: Whisper large-v3-turbo (1.6 GB)", flush=True)
    download_model("large-v3-turbo")
    if a.no_synthesis:
        print("     synthesis skipped (--no-synthesis)")
    elif not tts.available():
        print("     synthesis not installed: pip install 'sosie[voice]' then sosie setup again")
    else:
        print("2/3  synthesis: Chatterbox Multilingual V3 (3 GB) and its Whisper judge large-v3 (2.9 GB)", flush=True)
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id="ResembleAI/chatterbox", allow_patterns=CHATTERBOX_FILES, token=os.getenv("HF_TOKEN"))
        download_model("large-v3")
        import torch
        print("     GPU:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none (synthesis will run on the CPU, slowly)")
    path = demo_project(a.lang or default_lang())
    print(f"3/3  demo project: {path}")
    print("Ready. Start the studio with: sosie")


def cmd_demo(a):
    a.project = demo_project(a.lang or default_lang())
    cmd_studio(a)


def cmd_init(a):
    from . import project, scripts
    with open(a.script, encoding="utf-8") as f:
        chapters, timing = scripts.parse(f.read(), a.format, a.script)
    project.create(a.dir, a.name or os.path.basename(os.path.abspath(a.dir)), a.lang, chapters, film=a.film, timing=timing)
    n = sum(len(c["lines"]) for c in chapters)
    print(f"{a.dir}: {n} lines in {len(chapters)} chapter(s)" + (", with timings" if timing else ""))


def cmd_say(a):
    from . import tts, voices
    vid = a.voice or (voices.list_voices() or [{}])[0].get("id")
    if not vid:
        sys.exit("no voice in the library: sosie voice add …")
    st = {k: getattr(a, k) for k in ("exaggeration", "cfg_weight", "temperature", "tempo") if getattr(a, k) is not None}
    res = tts.Engine(device=a.device).speak(a.text, vid, lang=a.lang, settings=st, tries=a.tries, check=not a.no_check)
    tts.save(a.out, res["y"])
    for r in res["report"]:
        print(f"{r['text']}  ({r['bad']} error(s))")
    print(a.out, f"{len(res['y']) / tts.SR_OUT:.1f} s")


def cmd_render(a):
    from . import project, tts
    p = project.Project(a.project, None, None)
    out = a.out or p.path("guide")
    tts.render(p, a.voice, out, only=[x for x in a.only.split(",") if x], resume=not a.no_resume, tries=a.tries, seed=a.seed,
               engine=tts.Engine(device=a.device))
    print(out)


def cmd_tempo(a):
    """A voice track folder sped up: <dst>/<id>.wav, durations.json and words.json recomputed; the source is not touched."""
    from . import audio
    os.makedirs(a.dst, exist_ok=True)
    durs = read_json(os.path.join(a.src, "durations.json"), {})
    words = read_json(os.path.join(a.src, "words.json"), {})
    out_d, out_w = {}, {}
    for lid, m in durs.items():
        b = os.path.join(a.dst, f"{lid}.wav")
        audio.atempo(os.path.join(a.src, f"{lid}.wav"), b, a.factor)
        out_d[lid] = {**m, "dur": round(audio.wav_duration(b), 2), "tempo": a.factor}
        out_w[lid] = [{**x, "s": round(x["s"] / a.factor, 3), "e": round(x["e"] / a.factor, 3)} for x in words.get(lid, [])]
    write_json(os.path.join(a.dst, "durations.json"), out_d)
    write_json(os.path.join(a.dst, "words.json"), out_w, indent=None)
    print(a.dst, len(out_d), "lines", round(sum(v["dur"] for v in out_d.values()), 1), "s")


def cmd_voice(a):
    from . import voices
    if a.action == "list":
        for v in voices.list_voices():
            st = v["settings"]
            print(f"{v['id']:20s} {v['lang']}  {v['name']:24s} ref {v['refDur']:4.1f} s  exag {st['exaggeration']} cfg {st['cfg_weight']} "
                  f"temp {st['temperature']} tempo {st['tempo']}")
    elif a.action == "add":
        vid = voices.create(a.name, a.lang)
        if a.ref:
            voices.import_ref(vid, a.ref)
        print(vid, voices.vdir(vid))
    elif a.action == "import":
        print(voices.import_ref(a.name, a.ref))
    elif a.action == "from-project":
        from . import project
        p = project.Project(a.project, None, None)
        print(voices.build_ref(a.name, p.kept_takes([x for x in a.ids.split(",") if x] or None), noise=p.path("noise"),
                               depth=p.nr_depth(), project=p.name))


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in COMMANDS + ("-h", "--help", "--version"):
        argv = ["studio"] + argv
    ap = argparse.ArgumentParser(prog="sosie", description="Sosie: your voice double. Record, clone, speak.")
    ap.add_argument("--version", action="version", version=f"sosie {VERSION}")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("studio", help="the studio in the browser")
    s.add_argument("project", nargs="?")
    s.add_argument("--port", type=int, default=8777)
    s.add_argument("--no-browser", action="store_true")
    s.add_argument("--whisper", default="large-v3-turbo", help="speech model for the takes (CPU)")
    s.add_argument("--device", default=None, help="synthesis device (cuda, cpu; default: cuda if available)")
    s.set_defaults(fn=cmd_studio)

    s = sub.add_parser("setup", help="download the models and create the demo project")
    s.add_argument("--no-synthesis", action="store_true", help="only the speech recognition of the studio")
    s.add_argument("--lang", choices=["fr", "en"], help="language of the demo project (default: the system's)")
    s.set_defaults(fn=cmd_setup)

    s = sub.add_parser("demo", help="the studio on the demo project")
    s.add_argument("--lang", choices=["fr", "en"])
    s.add_argument("--port", type=int, default=8777)
    s.add_argument("--no-browser", action="store_true")
    s.add_argument("--whisper", default="large-v3-turbo")
    s.add_argument("--device", default=None)
    s.set_defaults(fn=cmd_demo)

    s = sub.add_parser("init", help="new project from a script")
    s.add_argument("dir")
    s.add_argument("--script", required=True)
    s.add_argument("--lang", default="fr")
    s.add_argument("--name")
    s.add_argument("--film", help="reference video (picture under the rythmo band)")
    s.add_argument("--format", choices=["txt", "md", "srt", "json"])
    s.set_defaults(fn=cmd_init)

    s = sub.add_parser("say", help="a text in a library voice")
    s.add_argument("text")
    s.add_argument("--voice")
    s.add_argument("--lang")
    s.add_argument("--out", default="sosie.wav")
    s.add_argument("--tries", type=int, default=4)
    s.add_argument("--no-check", action="store_true", help="first draw, no Whisper check")
    s.add_argument("--exaggeration", type=float)
    s.add_argument("--cfg-weight", dest="cfg_weight", type=float)
    s.add_argument("--temperature", type=float)
    s.add_argument("--tempo", type=float)
    s.add_argument("--device")
    s.set_defaults(fn=cmd_say)

    s = sub.add_parser("render", help="every line of a project in a voice")
    s.add_argument("project")
    s.add_argument("--voice", required=True)
    s.add_argument("--out", help="voice track folder (default: the project's guide folder)")
    s.add_argument("--only", default="", help="ids, comma-separated, in the order to make them")
    s.add_argument("--tries", type=int, default=5)
    s.add_argument("--seed", type=int, default=0, help="shifts the draws, to redo a line differently")
    s.add_argument("--no-resume", action="store_true", help="redo the lines already made with the same text and reference")
    s.add_argument("--device")
    s.set_defaults(fn=cmd_render)

    s = sub.add_parser("tempo", help="speed a voice track folder up or down (WSOLA)")
    s.add_argument("src")
    s.add_argument("dst")
    s.add_argument("factor", type=float)
    s.set_defaults(fn=cmd_tempo)

    s = sub.add_parser("voice", help="the voice library")
    s.add_argument("action", choices=["list", "add", "import", "from-project"])
    s.add_argument("name", nargs="?", help="add: the voice's name; import, from-project: its id")
    s.add_argument("--lang", default="fr")
    s.add_argument("--ref", help="add, import: a recording of the voice (30 s is best)")
    s.add_argument("--project", help="from-project: the project whose kept takes make the reference")
    s.add_argument("--ids", default="", help="from-project: lines to use, in order (the first one sets the tone)")
    s.set_defaults(fn=cmd_voice)

    a = ap.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
