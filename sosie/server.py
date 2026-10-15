"""Local web server: the studio (recording, takes, export), the voice library and the synthesis panel, on http://localhost:8777.
Binds to 127.0.0.1 only; POST requests need the X-Sosie header (a web page from elsewhere cannot send it without a CORS
preflight, which is never granted) and the Host must be local (no DNS rebinding)."""
import json
import mimetypes
import os
import queue
import re
import shutil
import tempfile
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from . import clips, scripts, tts, voices
from . import project as projects
from .asr import Transcriber
from .audio import is_wav
from .util import VERSION, home, log, read_json, write_json

STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
mimetypes.add_type("text/javascript", ".js")


class App:
    def __init__(self, whisper="large-v3-turbo", device=None):
        self.work = projects.Worker()
        self.work.start()
        self.asr = Transcriber(whisper)
        self.engine = tts.Engine(device=device)
        self.project = None
        self.lock = threading.RLock()
        self.jobs = {}
        self.jq = queue.Queue()
        threading.Thread(target=self.job_loop, daemon=True).start()

    # ------------------------------------------------------------ projects
    def open(self, path):
        p = projects.Project(path, self.work, self.asr)
        p.resume()
        with self.lock:
            self.project = p
        projects.recent(add=p.dir)
        log(f"project: {p.name} ({p.lang}, {len(p.lines)} lines) — {p.dir}")
        return p

    def need(self):
        if self.project is None:
            raise LookupError("no project open")
        return self.project

    def app_state(self):
        rec = []
        for d in projects.recent():
            c = read_json(os.path.join(d, "sosie.json"), {})
            if c.get("kind") != "voice":
                rec.append({"dir": d, "name": c.get("name") or os.path.basename(d), "lang": c.get("lang")})
        return {"version": VERSION, "home": home(), "project": self.project.summary() if self.project else None,
                "recent": rec, "voices": voices.list_voices(), "langs": tts.LANGS, "prompts": voices.PROMPTS,
                "engine": {"available": tts.available(), "loaded": self.engine.loaded, "device": self.engine.device},
                "jobs": [self.job_view(j) for j in self.jobs.values() if j["status"] in ("queued", "running")]}

    # ------------------------------------------------------------ jobs on the GPU, one at a time
    def submit(self, kind, fn, **info):
        jid = uuid.uuid4().hex[:10]
        self.jobs[jid] = {"id": jid, "kind": kind, "status": "queued", "progress": None, "result": None, "error": None,
                          "created": time.time(), "fn": fn, **info}
        self.jq.put(jid)
        return self.job_view(self.jobs[jid])

    def job_view(self, j):
        return {k: v for k, v in j.items() if k != "fn"}

    def job_loop(self):
        while True:
            j = self.jobs[self.jq.get()]
            j["status"] = "running"
            try:
                j["result"] = j["fn"](lambda **p: j.__setitem__("progress", p))
                j["status"] = "done"
            except Exception as e:
                traceback.print_exc()
                j["status"], j["error"] = "error", str(e)[:400]
            for k in [k for k, v in self.jobs.items() if v["status"] in ("done", "error") and time.time() - v["created"] > 3600]:
                self.jobs.pop(k, None)

    def synth_clip(self, text, vid, lang, settings, tries, check):
        name = voices.conf(vid).get("name", vid)

        def run(progress):
            res = self.engine.speak(text, vid, lang=lang, settings=settings, tries=tries, check=check,
                                    progress=lambda s, n, k, t: progress(sentence=s + 1, sentences=n, draw=k + 1, draws=t))
            return clips.add(res, text, vid, name)
        return self.submit("clip", run, voice=vid, text=text[:120])

    def synth_guide(self, vid):
        p = self.need()

        def run(progress):
            out = p.path("guide")
            tts.render(p, vid, out, tries=3, engine=self.engine, log_fn=log,
                       progress=lambda i, n, lid: progress(line=i + 1, lines=n, id=lid))
            p.conf["guide_voice"] = vid
            p.save_conf()
            for ln in p.lines:
                p.work.put(1, p.guide_words, ln["id"])
            return {"guide": out}
        return self.submit("guide", run, voice=vid, project=p.dir)


APP = None


def lines_to_text(p):
    out = []
    for ch in p.chapters:
        if ch["title"]:
            out.append(f"# {ch['title']}")
        out += [f"[{ln['id']}] {ln['text']}" for ln in p.lines if ln["ch"] == ch["num"]]
    return "\n\n".join(out) + "\n"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    # ------------------------------------------------------------ responses
    def send_json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def fail(self, msg, code=400):
        return self.send_json({"error": str(msg)}, code)

    def send_file(self, path, base, download=None):
        path = os.path.realpath(path)
        if not path.startswith(os.path.realpath(base) + os.sep) or not os.path.isfile(path):
            return self.fail("not found", 404)
        size = os.path.getsize(path)
        a, b = 0, size - 1
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        if m and (m[1] or m[2]):
            a, b = (int(m[1]), int(m[2]) if m[2] else size - 1) if m[1] else (size - int(m[2]), size - 1)
            b = min(b, size - 1)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {a}-{b}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(b - a + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        if download:
            self.send_header("Content-Disposition", f'attachment; filename="{download}"')
        self.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(a)
                left = b - a + 1
                while left > 0:
                    chunk = f.read(min(1 << 20, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def local(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
        return host in ("localhost", "127.0.0.1", "::1")

    # ------------------------------------------------------------ GET
    def do_GET(self):
        if not self.local():
            return self.fail("forbidden", 403)
        u = urlparse(self.path)
        p, q = unquote(u.path), parse_qs(u.query)
        try:
            return self.get(p, q)
        except LookupError as e:
            return self.fail(e, 404)
        except Exception as e:
            traceback.print_exc()
            return self.fail(e, 500)

    def get(self, p, q):
        A = APP
        if p == "/":
            return self.send_file(os.path.join(STATIC, "index.html"), STATIC)
        if p.startswith("/static/"):
            return self.send_file(os.path.join(STATIC, p[8:]), STATIC)
        if p == "/api/app":
            return self.send_json(A.app_state())
        if p == "/api/fs":
            return self.send_json(browse(q.get("dir", [""])[0]))
        if m := re.fullmatch(r"/api/jobs/(\w+)", p):
            j = A.jobs.get(m[1])
            return self.send_json(A.job_view(j)) if j else self.fail("unknown job", 404)
        if p == "/api/voices":
            return self.send_json(voices.list_voices())
        if m := re.fullmatch(r"/voices/([\w-]+)/ref\.wav", p):
            return self.send_file(voices.ref_path(m[1]), voices.vdir(m[1]))
        if p == "/api/clips":
            return self.send_json(clips.list_clips())
        if m := re.fullmatch(r"/clips/([\w.-]+)\.wav", p):
            return self.send_file(clips.path(m[1]), clips.root(), download=m[1] + ".wav" if "dl" in q else None)
        # the open project
        pr = A.need()
        if p == "/api/state":
            return self.send_json(pr.state())
        if p == "/api/script":
            return self.send_json({"text": lines_to_text(pr)})
        if (m := re.fullmatch(r"/api/line/([\w-]+)", p)) and m[1] in pr.byid:
            with pr.lock:
                st = pr.line_state(pr.byid[m[1]])
            if st["guide"] is None and "guide" in q:
                pr.work.put(1, pr.guide_words, m[1])
            return self.send_json(st)
        if p == "/film" and pr.film():
            f = pr.film()
            return self.send_file(f, os.path.dirname(f))
        if m := re.fullmatch(r"/guide/([\w-]+)\.wav", p):
            return self.send_file(os.path.join(pr.path("guide"), m[1] + ".wav"), pr.path("guide"))
        if m := re.fullmatch(r"/export/([\w-]+)\.wav", p):
            return self.send_file(os.path.join(pr.path("export"), m[1] + ".wav"), pr.path("export"))
        if m := re.fullmatch(r"/takes/([\w-]+)/(t\d+\.wav)", p):
            return self.send_file(os.path.join(pr.path("takes"), m[1], m[2]), pr.path("takes"))
        return self.fail("not found", 404)

    # ------------------------------------------------------------ POST
    def do_POST(self):
        if not self.local() or self.headers.get("X-Sosie") != "1":
            return self.fail("forbidden", 403)
        p = unquote(urlparse(self.path).path)
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        try:
            return self.post(p, body)
        except LookupError as e:
            return self.fail(e, 404)
        except (ValueError, FileExistsError, FileNotFoundError, RuntimeError) as e:
            return self.fail(e, 400)
        except Exception as e:
            traceback.print_exc()
            return self.fail(e, 500)

    def post(self, p, body):
        A = APP
        js = (lambda: json.loads(body or b"{}"))
        # projects
        if p == "/api/project/open":
            A.open(os.path.expanduser(js()["dir"]))
            return self.send_json(A.app_state())
        if p == "/api/project/new":
            d = js()
            path = os.path.expanduser(d["dir"])
            text = d.get("script") or ""
            if not text and d.get("scriptFile"):
                with open(os.path.expanduser(d["scriptFile"]), encoding="utf-8") as f:
                    text = f.read()
            chapters, timing = scripts.parse(text, d.get("format"), d.get("scriptFile") or "")
            if not any(ch["lines"] for ch in chapters):
                raise ValueError("the script is empty")
            projects.create(path, d.get("name") or os.path.basename(path.rstrip("/")), d.get("lang", "fr"), chapters,
                            film=os.path.expanduser(d["film"]) if d.get("film") else None, timing=timing)
            A.open(path)
            return self.send_json(A.app_state())
        if p == "/api/project/close":
            A.project = None
            return self.send_json(A.app_state())
        if p == "/api/project/forget":
            projects.recent(remove=js()["dir"])
            return self.send_json(A.app_state())
        # voices
        if p == "/api/voices":
            d = js()
            prompts = [x for x in re.split(r"\n\s*\n|\n", d.get("prompts") or "") if x.strip()] or None
            vid = voices.create(d["name"], d.get("lang", "fr"), prompts)
            return self.send_json({"id": vid, "voices": voices.list_voices()})
        if m := re.fullmatch(r"/api/voices/([\w-]+)", p):
            return self.send_json(voices.update(m[1], js()))
        if m := re.fullmatch(r"/api/voices/([\w-]+)/delete", p):
            if A.project and os.path.realpath(A.project.dir) == os.path.realpath(voices.vdir(m[1])):
                A.project = None
            voices.delete(m[1])
            return self.send_json(voices.list_voices())
        if m := re.fullmatch(r"/api/voices/([\w-]+)/record", p):
            A.open(voices.vdir(m[1]))
            return self.send_json(A.app_state())
        if m := re.fullmatch(r"/api/voices/([\w-]+)/build", p):
            return self.send_json(voices.build_from_own_takes(m[1], A.work, A.asr))
        if m := re.fullmatch(r"/api/voices/([\w-]+)/import", p):
            with tempfile.NamedTemporaryFile(suffix=".audio") as f:
                f.write(body)
                f.flush()
                return self.send_json(voices.import_ref(m[1], f.name, unquote(self.headers.get("X-File-Name") or "upload")))
        if m := re.fullmatch(r"/api/voices/([\w-]+)/from-project", p):
            pr = A.need()
            d = js()
            return self.send_json(voices.build_ref(m[1], pr.kept_takes(d.get("ids") or None), noise=pr.path("noise"),
                                                   depth=pr.nr_depth(), project=pr.name))
        # synthesis
        if p == "/api/synth":
            d = js()
            if not tts.available():
                raise RuntimeError("synthesis not installed: pip install 'sosie[voice]'")
            text = (d.get("text") or "").strip()
            if not text:
                raise ValueError("nothing to say")
            return self.send_json(A.synth_clip(text, d["voice"], d.get("lang"), d.get("settings") or {},
                                               int(d.get("tries", 3)), bool(d.get("check", True))))
        if p == "/api/synth/unload":
            A.engine.unload()
            return self.send_json(A.app_state())
        if m := re.fullmatch(r"/api/clips/([\w.-]+)/(delete|copy|save)", p):
            if not os.path.exists(clips.path(m[1])):
                raise LookupError("unknown clip")
            if m[2] == "delete":
                clips.delete(m[1])
                return self.send_json(clips.list_clips())
            if m[2] == "copy":
                return self.send_json({"tool": clips.copy_to_clipboard(clips.path(m[1])), "path": clips.path(m[1])})
            return self.send_json({"path": clips.save_as(m[1], js().get("dest") or "~")})
        # the open project
        pr = A.need()
        if p == "/api/guide":
            if not tts.available():
                raise RuntimeError("synthesis not installed: pip install 'sosie[voice]'")
            return self.send_json(A.synth_guide(js()["voice"]))
        if p == "/api/script":
            chapters, _ = scripts.parse(js()["text"], "txt")
            if not any(ch["lines"] for ch in chapters):
                raise ValueError("the script is empty")
            ids = [ln["id"] for ch in chapters for ln in ch["lines"]]
            if len(set(ids)) != len(ids):
                raise ValueError("two lines have the same id")
            shutil.copy2(pr.p("script.json"), pr.p("script.json.bak"))
            write_json(pr.p("script.json"), {"chapters": chapters})
            A.open(pr.dir)
            return self.send_json(A.project.state())
        if (m := re.fullmatch(r"/api/take/([\w-]+)", p)) and m[1] in pr.byid:
            if not is_wav(body):
                raise ValueError("not a WAV file")
            info = json.loads(unquote(self.headers.get("X-Rec-Info") or "{}"))
            return self.send_json(pr.new_take(m[1], body, info))
        if (m := re.fullmatch(r"/api/(select|discard)/([\w-]+)/(\d+)", p)) and m[2] in pr.byid:
            (pr.select if m[1] == "select" else pr.discard)(m[2], int(m[3]))
            with pr.lock:
                return self.send_json(pr.line_state(pr.byid[m[2]]))
        if (m := re.fullmatch(r"/api/unselect/([\w-]+)", p)) and m[1] in pr.byid:
            pr.select(m[1], None)
            with pr.lock:
                return self.send_json(pr.line_state(pr.byid[m[1]]))
        if p == "/api/noise":
            if not is_wav(body):
                raise ValueError("not a WAV file")
            pr.save_noise(body)
            return self.send_json({"noise": pr.noise_state()})
        if p == "/api/settings":
            return self.send_json(pr.update_settings(js()))
        if p == "/api/todo":
            ids = [i for i in js().get("ids", []) if i in pr.byid]
            write_json(pr.path("todo"), ids)
            return self.send_json({"todo": ids})
        return self.fail("not found", 404)


def browse(d):
    """A folder for the picker: sub-folders (Sosie projects marked) and script files."""
    d = os.path.abspath(os.path.expanduser(d or "~"))
    if not os.path.isdir(d):
        d = os.path.dirname(d)
    dirs, files = [], []
    try:
        for f in sorted(os.listdir(d), key=str.lower):
            if f.startswith("."):
                continue
            full = os.path.join(d, f)
            if os.path.isdir(full):
                dirs.append({"name": f, "project": projects.is_project(full)})
            elif f.lower().endswith((".txt", ".md", ".srt", ".json", ".mp4", ".mov", ".mkv", ".webm", ".wav", ".mp3", ".flac", ".ogg", ".m4a")):
                files.append(f)
    except PermissionError:
        pass
    return {"dir": d, "parent": os.path.dirname(d) if d != "/" else None, "project": projects.is_project(d), "dirs": dirs, "files": files}


def serve(port=8777, project=None, whisper="large-v3-turbo", device=None):
    global APP
    APP = App(whisper, device)
    if project:
        APP.open(project)
    else:
        rec = [d for d in projects.recent() if read_json(os.path.join(d, "sosie.json"), {}).get("kind") != "voice"]
        if rec:
            try:
                APP.open(rec[0])
            except Exception:
                traceback.print_exc()
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    srv.daemon_threads = True
    log(f"Sosie {VERSION}: http://localhost:{port}")
    return srv
