"use strict";
// Sosie: the shell (tabs, projects) and the studio (takes line by line, full text or rythmo band on the film, listening, choice of takes).

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem("sosie." + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("sosie." + k, JSON.stringify(v));
    } catch {}
  },
};
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

async function api(path, opts = {}) {
  const post = opts.method === "POST";
  const r = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), ...(post ? { "X-Sosie": "1" } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
const post = (path, body, headers) =>
  api(path, { method: "POST", body: body instanceof Blob || body instanceof ArrayBuffer ? body : JSON.stringify(body ?? {}), headers });

// ================================================================== shell
const G = { app: null, view: LS.get("view", "studio"), listeners: [] };

async function boot() {
  setUiLang(LS.get("uilang", navigator.language.startsWith("fr") ? "fr" : "en"));
  G.app = await api("/api/app");
  document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
  fillLangSelect($("#pj-lang"), "fr");
  projectButton();
  if (G.app.project) await loadProject();
  setView(G.view);
  requestAnimationFrame(tick);
  setInterval(pollJobs, 1500);
}

function setView(v) {
  G.view = v;
  LS.set("view", v);
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  document.querySelectorAll(".view").forEach((s) => s.classList.remove("on"));
  if (v === "studio") {
    $("#view-studio").classList.add("on");
    $("#noproject").classList.add("on");
    if (S.data && !S.node && !G.gateShown) {
      G.gateShown = true;
      $("#gate").classList.add("on");
    }
  } else {
    stopPlay();
    $("#view-" + v).classList.add("on");
  }
  G.listeners.forEach((f) => f(v));
}
const onView = (f) => G.listeners.push(f);

function setUiLang(l) {
  I18N.lang = l;
  LS.set("uilang", l);
  document.documentElement.lang = l;
  $("#uilang").value = l;
  applyI18n();
  if (G.app) {
    projectButton();
    if (S.data) rebuildStudio();
    G.listeners.forEach((f) => f(G.view, true));
  }
}

function fillLangSelect(sel, value) {
  sel.innerHTML = Object.entries(G.app.langs).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  sel.value = value;
}

function projectButton() {
  const p = G.app.project;
  $("#projbtn").innerHTML = p ? `${esc(p.kind === "voice" ? t("pj.voiceproj") : t("pj.proj"))} <b>${esc(p.name)}</b> ▾` : esc(t("pj.none")) + " ▾";
}

async function refreshApp() {
  G.app = await api("/api/app");
  projectButton();
  return G.app;
}

let toastT = 0;
function toast(msg, ms = 2600) {
  const tt = $("#toast");
  tt.textContent = msg;
  tt.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => tt.classList.remove("on"), ms);
}

const anyOverlay = () => document.querySelector(".ov.on:not(#gate):not(#noiseov)");
document.querySelectorAll(".ov [data-close]").forEach((b) => (b.onclick = () => b.closest(".ov").classList.remove("on")));
document.querySelectorAll(".ov").forEach((o) => o.addEventListener("mousedown", (e) => e.target === o && o.id !== "gate" && o.id !== "noiseov" && o.classList.remove("on")));

// ------------------------------------------------------------------ jobs (synthesis on the GPU)
const JOBS = new Map(); // id -> {onDone, onProgress}
function watchJob(job, handlers) {
  JOBS.set(job.id, handlers);
  pollJobs();
}
async function pollJobs() {
  if (!JOBS.size) {
    $("#jobs").textContent = "";
    return;
  }
  for (const [id, h] of [...JOBS]) {
    let j;
    try {
      j = await api(`/api/jobs/${id}`);
    } catch {
      JOBS.delete(id);
      continue;
    }
    h.onProgress?.(j);
    if (j.status === "done" || j.status === "error") {
      JOBS.delete(id);
      j.status === "done" ? h.onDone?.(j.result, j) : h.onError?.(j.error, j);
    }
  }
  $("#jobs").innerHTML = JOBS.size ? `<span class="spin"></span> ${esc(t("jobs.running", { n: JOBS.size }))}` : "";
}

// ------------------------------------------------------------------ project dialog
$("#projbtn").onclick = openProjectDialog;
$("#np-open").onclick = openProjectDialog;

async function openProjectDialog() {
  await refreshApp();
  const p = G.app.project;
  const cur = $("#pj-current");
  if (p && S.data) {
    const d = S.data;
    const vlist = G.app.voices.filter((v) => v.ref);
    cur.innerHTML = `<div class="card"><h2>${esc(p.name)}</h2><dl class="kv">
      <dt>${t("pj.k.dir")}</dt><dd>${esc(p.dir)}</dd>
      <dt>${t("pj.k.lang")}</dt><dd>${esc(G.app.langs[p.lang] || p.lang)}</dd>
      <dt>${t("pj.k.lines")}</dt><dd>${S.lines.length} · ${S.lines.filter((l) => selTake(l)).length} ${t("pj.k.recorded")}</dd>
      <dt>${t("pj.k.export")}</dt><dd>${esc(d.paths.export)}</dd>
      <dt>${t("pj.k.takes")}</dt><dd>${esc(d.paths.takes)}</dd>
      <dt>${t("pj.k.guide")}</dt><dd>${esc(d.paths.guide)}${d.guideVoice ? ` (${esc(d.guideVoice)})` : ""}</dd>
      <dt>${t("pj.k.film")}</dt><dd>${esc(d.filmPath || d.filmName || "—")} <button id="pj-film-choose">${t("pj.film.choose")}</button>${d.film ? ` <button id="pj-film-rm">${t("pj.film.remove")}</button>` : ""}</dd></dl>
      <div class="row" style="margin-top:10px">
        <button id="pj-edit">${t("pj.edit")}</button>
        <span class="spacer"></span><button id="pj-close">${t("pj.close")}</button></div>
      ${G.app.engine.available && vlist.length ? `<div class="row" style="margin-top:10px"><span class="muted">${t("pj.synth")}</span>
        <select id="pj-gvoice">${vlist.map((v) => `<option value="${esc(v.id)}">${esc(v.name)} · ${v.lang}</option>`).join("")}</select>
        <select id="pj-gwhich"><option value="missing">${t("pj.synth.missing")}</option><option value="all">${t("pj.synth.all")}</option></select>
        <button id="pj-guide">${t("pj.synth.go")}</button></div><p class="muted" style="font-size:12px;margin-top:4px">${t("pj.synth.hint")}</p>` : ""}</div>`;
    $("#pj-edit").onclick = openScriptEditor;
    $("#pj-film-choose").onclick = chooseFilm;
    if ($("#pj-film-rm")) $("#pj-film-rm").onclick = async () => {
      await post("/api/film", { path: null });
      await loadProject();
      toast(t("pj.film.removed"));
      $("#projdlg").classList.remove("on");
    };
    $("#pj-close").onclick = async () => {
      await post("/api/project/close");
      await refreshApp();
      unloadProject();
      $("#projdlg").classList.remove("on");
    };
    if ($("#pj-guide")) {
      const gv = vlist.find((v) => v.id === $("#t-voice").value) || vlist.find((v) => v.lang === p.lang);
      if (gv) $("#pj-gvoice").value = gv.id;
      $("#pj-guide").onclick = () => synthAll($("#pj-gvoice").value, $("#pj-gwhich").value);
    }
  } else cur.innerHTML = `<p class="muted">${t("pj.none.long")}</p>`;
  const rec = $("#pj-recent");
  rec.innerHTML = "";
  G.app.recent.forEach((r) => {
    const it = el("div", "fe", `<b>${esc(r.name)}</b> <span class="muted">${esc(r.lang || "")}</span> <small>${esc(r.dir)}</small>`);
    it.onclick = () => openProject(r.dir);
    rec.append(it);
  });
  if (!G.app.recent.length) rec.innerHTML = `<p class="muted" style="font-size:13px">${t("pj.norecent")}</p>`;
  $("#pj-newbox").open = !p && !G.app.recent.length;
  browseTo(LS.get("fsdir", p ? p.dir : ""));
  $("#projdlg").classList.add("on");
}

async function openProject(dir) {
  try {
    G.app = await post("/api/project/open", { dir });
    projectButton();
    await loadProject();
    $("#projdlg").classList.remove("on");
    setView("studio");
  } catch (e) {
    toast(t("pj.err.open", { e: e.message }));
  }
}

async function synthAll(vid, which) {
  try {
    const job = await post("/api/synthtakes", { voice: vid, [which]: true });
    toast(t("pj.synth.started", { n: job.ids.length }), 4000);
    $("#projdlg").classList.remove("on");
    watchJob(job, {
      onProgress: (j) => j.progress && ($("#jobs").title = `${j.progress.line}/${j.progress.lines} ${j.progress.id}`),
      onDone: async (res) => {
        toast(t("pj.synth.done", { n: res.takes.length, k: res.takes.filter((x) => x.kept).length }), 5000);
        await loadProject();
      },
      onError: (e) => toast(t("err", { e })),
    });
  } catch (e) {
    toast(t("err", { e: e.message }));
  }
}

// file picker: folders and files of the given extensions; resolves with the chosen path
function pickFile(title, exts) {
  return new Promise((resolve) => {
    $("#pk-title").textContent = title;
    const show = async (dir) => {
      let r;
      try {
        r = await api(`/api/fs?dir=${encodeURIComponent(dir || "")}`);
      } catch {
        r = await api("/api/fs?dir=");
      }
      LS.set("pkdir", r.dir);
      $("#pk-dir").value = r.dir;
      const box = $("#pk-list");
      box.innerHTML = "";
      r.dirs.forEach((d) => {
        const it = el("div", "fe", `📁 ${esc(d.name)}`);
        it.onclick = () => show(r.dir + "/" + d.name);
        box.append(it);
      });
      r.files.filter((f) => exts.test(f)).forEach((f) => {
        const it = el("div", "fe file pick", `${/\.(mp4|m4v|mov|mkv|webm)$/i.test(f) ? "🎞" : "📄"} ${esc(f)}`);
        it.onclick = () => {
          $("#pickdlg").classList.remove("on");
          resolve(r.dir + "/" + f);
        };
        box.append(it);
      });
      if (!box.children.length) box.append(el("div", "fe muted", esc(t("pk.empty"))));
      $("#pk-up").onclick = () => r.parent && show(r.parent);
    };
    $("#pk-dir").onkeydown = (e) => e.key === "Enter" && show(e.target.value);
    show(LS.get("pkdir", S.data?.project.dir || ""));
    $("#pickdlg").classList.add("on");
  });
}
const VIDEO = /\.(mp4|m4v|mov|mkv|webm)$/i, SCRIPT = /\.(txt|md|srt|json)$/i;

async function chooseFilm() {
  const path = await pickFile(t("pj.film.pick"), VIDEO);
  const st = await post("/api/film", { path });
  const unplaced = st.lines.every((l) => !l.film);
  await loadProject();
  if (unplaced) {                       // nothing placed yet: the lines one after the other from the start, to adjust
    applyState(await post("/api/timing", { set: layoutFrom(0, 0) }));
    toast(t("pj.film.laid"), 6000);
  } else toast(t("pj.film.set", { f: path.split("/").at(-1) }));
  $("#projdlg").classList.remove("on");
}

$("#pj-filmpick").onclick = async () => ($("#pj-film").value = await pickFile(t("pj.film.pick"), VIDEO));
$("#pj-scriptpick").onclick = async () => {
  G.pick.script = await pickFile(t("pj.script.pick"), SCRIPT);
  $("#pj-scriptfile").textContent = t("pj.script.file", { f: G.pick.script });
  if (!$("#pj-name").value) $("#pj-name").value = G.pick.script.split("/").at(-1).replace(/\.\w+$/, "");
};

// folder picker
G.pick = { script: null, film: null };
async function browseTo(dir) {
  let r;
  try {
    r = await api(`/api/fs?dir=${encodeURIComponent(dir || "")}`);
  } catch {
    r = await api(`/api/fs?dir=`);
  }
  LS.set("fsdir", r.dir);
  $("#fs-dir").value = r.dir;
  const box = $("#fs-list");
  box.innerHTML = "";
  r.dirs.forEach((d) => {
    const it = el("div", "fe" + (d.project ? " proj" : ""), `${d.project ? "◉" : "📁"} ${esc(d.name)}`);
    it.onclick = () => (d.project ? openProject(r.dir + "/" + d.name) : browseTo(r.dir + "/" + d.name));
    box.append(it);
  });
  r.files.forEach((f) => {
    const full = r.dir + "/" + f;
    const isScript = /\.(txt|md|srt|json)$/i.test(f), isFilm = /\.(mp4|mov|mkv|webm)$/i.test(f);
    const it = el("div", "fe file" + (G.pick.script === full || G.pick.film === full ? " pick" : ""), `${isFilm ? "🎞" : isScript ? "📄" : "🎵"} ${esc(f)}`);
    it.onclick = () => {
      if (isScript) G.pick.script = full, $("#pj-script").value = "", $("#pj-script").placeholder = t("pj.script.file", { f: full });
      else if (isFilm) G.pick.film = full, $("#pj-film").value = full;
      else return;
      $("#pj-newbox").open = true;
      if (!$("#pj-dir").value) $("#pj-dir").value = r.dir + "/" + ($("#pj-name").value ? slug($("#pj-name").value) : "sosie-" + slug(f.replace(/\.\w+$/, "")));
      browseTo(r.dir);
    };
    box.append(it);
  });
  $("#fs-up").onclick = () => r.parent && browseTo(r.parent);
  $("#fs-open").disabled = !r.project;
  $("#fs-open").onclick = () => openProject(r.dir);
}
$("#fs-dir").addEventListener("keydown", (e) => e.key === "Enter" && browseTo(e.target.value));
const slug = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
$("#pj-name").addEventListener("input", () => {
  const d = $("#pj-dir");
  if (!d.dataset.touched) d.value = (LS.get("fsdir", "~") || "~") + "/" + slug($("#pj-name").value);
});
$("#pj-dir").addEventListener("input", (e) => (e.target.dataset.touched = "1"));
$("#pj-create").onclick = async () => {
  $("#pj-err").textContent = "";
  try {
    const body = { name: $("#pj-name").value.trim(), lang: $("#pj-lang").value, dir: $("#pj-dir").value.trim(), film: $("#pj-film").value.trim() || null };
    if ($("#pj-script").value.trim()) body.script = $("#pj-script").value;
    else if (G.pick.script) body.scriptFile = G.pick.script;
    if (!body.dir) throw new Error(t("pj.err.dir"));
    G.app = await post("/api/project/new", body);
    G.pick = { script: null, film: null };
    projectButton();
    await loadProject();
    $("#projdlg").classList.remove("on");
    setView("studio");
  } catch (e) {
    $("#pj-err").textContent = e.message;
  }
};

// script editor
async function openScriptEditor() {
  $("#scripted").value = (await api("/api/script")).text;
  $("#sc-err").textContent = "";
  $("#projdlg").classList.remove("on");
  $("#scriptdlg").classList.add("on");
}
$("#sc-save").onclick = async () => {
  try {
    S.data = await post("/api/script", { text: $("#scripted").value });
    S.lines = S.data.lines;
    rebuildStudio();
    $("#scriptdlg").classList.remove("on");
    toast(t("sc.saved"));
  } catch (e) {
    $("#sc-err").textContent = e.message;
  }
};

$("#uilang").onchange = (e) => setUiLang(e.target.value);
$("#helpbtn").onclick = () => $("#help").classList.toggle("on");

// ================================================================== studio
const FONT = 42;
const FONTSTR = () => `700 ${FONT}px ${getComputedStyle(document.body).getPropertyValue("--font")}`;
const S = {
  data: null, lines: [], cur: 0,
  mode: LS.get("mode", "texte"), film: LS.get("film", true), preroll: LS.get("preroll", 2), pxs: LS.get("pxs", 460),
  ctx: null, node: null, stream: null, src: null, devId: null, devLabel: "",
  rec: null, play: null, uploads: {},
};
const film = $("#film");
const player = $("#player");
const measure = document.createElement("canvas").getContext("2d");

const cur = () => S.lines[S.cur];
const byId = (id) => S.lines.find((s) => s.id === id);
const realTakes = (sh) => sh.takes.filter((tk) => !tk.tmp);
const selTake = (sh) => sh.takes.find((tk) => tk.n === sh.sel && !tk.tmp);
const hasFilm = (sh) => !!(S.data.film && sh.film);
const curKey = () => "cur:" + S.data.project.dir;

async function loadProject() {
  stopPlay();
  S.data = await api("/api/state");
  S.lines = S.data.lines;
  document.body.classList.remove("noproj");
  S.cur = LS.get(curKey(), 0);
  if (!(S.cur >= 0 && S.cur < S.lines.length)) S.cur = 0;
  const todo = S.data.todo || [];
  if (todo.length && !todo.includes(S.lines[S.cur]?.id)) {
    const next = todo.map((id) => S.lines.findIndex((sh) => sh.id === id)).find((i) => i >= 0 && !selTake(S.lines[i]));
    if (next !== undefined) S.cur = next;
  }
  film.removeAttribute("src");
  if (S.data.film) film.src = S.data.film + "?p=" + encodeURIComponent(S.data.project.dir);
  $("#chan").value = String(S.data.settings.channel ?? "auto");
  $("#denoise").value = String(S.data.settings.denoise ?? 14);
  $("#preroll").value = String(S.preroll);
  $("#filmon").disabled = !S.data.film;
  setFilm(S.film && !!S.data.film);
  noiseUI();
  rebuildStudio();
}

function applyState(st, keepId) {
  const id = keepId ?? (S.lines.length ? cur().id : null);
  S.data = st;
  S.lines = st.lines;
  const i = S.lines.findIndex((l) => l.id === id);
  S.cur = i >= 0 ? i : clamp(S.cur, 0, Math.max(0, S.lines.length - 1));
  rebuildStudio();
}

function unloadProject() {
  stopPlay();
  S.data = null;
  S.lines = [];
  document.body.classList.add("noproj");
  $("#nav").innerHTML = $("#script").innerHTML = $("#takes").innerHTML = $("#info").innerHTML = "";
}

function rebuildStudio() {
  if (!S.data) return;
  setMode(S.mode);
  buildNav();
  buildScript();
  if (!S.lines.length) return;
  S.cur = clamp(S.cur, 0, S.lines.length - 1);
  go(S.cur, true);
  progress();
}

// ------------------------------------------------------------------ microphone
async function openMic(deviceId) {
  if (!S.ctx) {
    S.ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    await S.ctx.audioWorklet.addModule("/static/rec-worklet.js");
    S.node = new AudioWorkletNode(S.ctx, "rec", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const mute = S.ctx.createGain();
    mute.gain.value = 0;
    S.node.connect(mute).connect(S.ctx.destination);
    S.node.port.onmessage = onWorklet;
  }
  await S.ctx.resume();
  if (S.src) S.src.disconnect();
  if (S.stream) S.stream.getTracks().forEach((tr) => tr.stop());
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } };
  if (deviceId) audio.deviceId = { exact: deviceId };
  S.stream = await navigator.mediaDevices.getUserMedia({ audio });
  S.src = S.ctx.createMediaStreamSource(S.stream);
  S.src.connect(S.node);
  const tr = S.stream.getAudioTracks()[0];
  S.devLabel = tr.label;
  S.devId = tr.getSettings().deviceId;
  LS.set("dev", S.devId);
  await listDevices();
}

async function listDevices() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  $("#dev").innerHTML = devs.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label || t("st.mic"))}</option>`).join("");
  $("#dev").value = S.devId;
  return devs;
}

async function enableMic() {
  $("#gateerr").textContent = "";
  try {
    try {
      await openMic(LS.get("dev", null));
    } catch {
      await openMic(null);
    }
    $("#gate").classList.remove("on");
    toast(t("st.mic.on", { d: S.devLabel }));
  } catch (e) {
    $("#gateerr").textContent = t("st.mic.err", { e: e.message || e });
  }
}

const M = { hold: [0, 0], holdT: [0, 0], chans: 0 };
function onWorklet(e) {
  const d = e.data;
  if (d.type === "meter") meter(d.pk);
  else if (d.type === "data" && S.rec) {
    d.ch.forEach((a, c) => (S.rec.chunks[c] ||= []).push(a));
    S.rec.len += d.ch[0].length;
  } else if (d.type === "stopped" && S.rec) finishRec();
}

function meter(pk) {
  const now = performance.now();
  M.chans = pk.length;
  const want = $("#chan").value;
  const act = want === "auto" ? (pk.length > 1 && M.hold[1] > M.hold[0] ? 1 : 0) : +want;
  for (let c = 0; c < 2; c++) {
    const on = c < pk.length;
    $("#m" + c).classList.toggle("off", !on);
    $("#ml" + c).classList.toggle("off", !on);
    if (!on) continue;
    const db = 20 * Math.log10(pk[c] + 1e-9);
    const x = clamp((db + 60) / 60, 0, 1);
    $(`#m${c} i`).style.width = x * 100 + "%";
    if (x >= M.hold[c] || now - M.holdT[c] > 1500) {
      M.hold[c] = x;
      M.holdT[c] = now;
    }
    $(`#m${c} b`).style.left = `calc(${M.hold[c] * 100}% - 2px)`;
    if (pk[c] >= 0.989) $("#clip").classList.add("on");
    if (c === act) $("#mdb").textContent = db < -59 ? "−∞ dB" : `${db.toFixed(0)} dB`;
  }
}

// ------------------------------------------------------------------ recording
function needMic() {
  if (S.node) return false;
  $("#gate").classList.add("on");
  return true;
}

function startRec() {
  if (S.rec || !S.data || !S.lines.length || needMic()) return;
  stopPlay();
  const sh = cur();
  S.rec = { id: sh.id, chunks: [], len: 0, t0: S.ctx.currentTime, mode: S.mode, stopping: false };
  S.node.port.postMessage("start");
  document.body.classList.add("recording");
  if (S.mode === "rythmo") {
    S.rec.words = bandWords(sh);
    if (S.film && hasFilm(sh)) {
      S.rec.clock = () => film.currentTime - sh.film.vo;
      film.muted = true;
      film.currentTime = Math.max(0, sh.film.vo - S.preroll);
      film.play().catch(() => {});
    } else {
      const t0 = performance.now();
      S.rec.clock = () => (performance.now() - t0) / 1000 - S.preroll;
    }
    setStrip(S.rec.words);
  }
}

function recordNoise() {
  if (S.rec || !S.data || needMic()) return;
  stopPlay();
  S.rec = { noise: true, chunks: [], len: 0, t0: S.ctx.currentTime, stopping: false };
  S.node.port.postMessage("start");
  $("#noisecount").textContent = "10";
  $("#noiseov").classList.add("on");
  const t0 = performance.now();
  S.rec.timer = setInterval(() => {
    const left = 10 - (performance.now() - t0) / 1000;
    $("#noisecount").textContent = Math.max(0, Math.ceil(left));
    if (left <= 0) stopRec(true);
  }, 100);
}

async function finishNoise(r) {
  clearInterval(r.timer);
  $("#noiseov").classList.remove("on");
  if (!r.keep) return toast(t("noise.cancel"));
  const chs = r.chunks.map(joinChunks);
  if (!chs.length || chs[0].length < S.ctx.sampleRate * 3) return toast(t("noise.short"));
  try {
    S.data.noise = (await post("/api/noise", wav24(chs, S.ctx.sampleRate), { "Content-Type": "audio/wav" })).noise;
    noiseUI();
    toast(t("noise.done"));
    refreshSoon();
  } catch (e) {
    toast(t("err", { e: e.message || e }));
  }
}

function noiseUI() {
  const n = S.data?.noise;
  $("#noisebtn").classList.toggle("need", !n);
  $("#noisebtn").title = n ? t("noise.redo.t", { d: n.date, s: n.dur }) : t("noise.need.t");
  $("#denoise").disabled = !n;
}

function refreshSoon() {
  const id = cur().id;
  [1500, 4000].forEach((ms) => setTimeout(async () => S.data && replaceShot(await api(`/api/line/${encodeURIComponent(id)}`)), ms));
}

function joinChunks(list) {
  const a = new Float32Array(list.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of list) {
    a.set(x, o);
    o += x.length;
  }
  return a;
}

function stopRec(keep, restart = false) {
  if (!S.rec || S.rec.stopping) return;
  Object.assign(S.rec, { stopping: true, keep, restart });
  S.node.port.postMessage("stop");
  film.pause();
}

function finishRec() {
  const r = S.rec;
  S.rec = null;
  if (r.noise) return finishNoise(r);
  document.body.classList.remove("recording");
  $("#count").textContent = "";
  clearKaraoke();
  if (r.keep) {
    const sr = S.ctx.sampleRate;
    const drop = Math.round(0.12 * sr); // the click of the stop key
    const chs = r.chunks.map((list) => {
      const a = joinChunks(list);
      return a.subarray(0, Math.max(0, a.length - drop));
    });
    if (chs.length && chs[0].length > sr * 0.3) {
      // fake stereo: the microphone channel (setting, or the loudest) on both sides
      const set = S.data.settings.channel;
      const rms = chs.map((a) => a.reduce((s, x) => s + x * x, 0));
      const k = Number.isInteger(set) && set < chs.length ? set : rms.indexOf(Math.max(...rms));
      upload(r.id, wav24([chs[k], chs[k]], sr), { mode: r.mode, preroll: S.preroll, device: S.devLabel, channels: chs.length, source: k });
    } else toast(t("st.tooshort"));
  }
  setStrip(bandWords(cur()));
  if (r.restart) startRec();
}

function wav24(chs, sr) {
  const n = chs[0].length, C = chs.length, ba = C * 3, size = n * ba;
  const buf = new ArrayBuffer(44 + size);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + size, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, C, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ba, true); v.setUint16(32, ba, true); v.setUint16(34, 24, true);
  str(36, "data"); v.setUint32(40, size, true);
  const out = new Uint8Array(buf);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < C; c++) {
      const x = Math.round(clamp(chs[c][i], -1, 1) * 8388607);
      out[o] = x & 255;
      out[o + 1] = (x >> 8) & 255;
      out[o + 2] = (x >> 16) & 255;
      o += 3;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

function upload(id, blob, info) {
  const sh = byId(id);
  const tmp = { n: -Date.now(), tmp: true, status: "envoi" };
  sh.takes.push(tmp);
  refresh(id);
  const p = (async () => {
    try {
      let m = null;
      for (let i = 0; ; i++) {             // the server may be restarting: retry before giving up
        try {
          m = await post(`/api/take/${encodeURIComponent(id)}`, blob, { "Content-Type": "audio/wav", "X-Rec-Info": encodeURIComponent(JSON.stringify(info)) });
          break;
        } catch (e) {
          if (i >= 30 || !/fetch|network/i.test(e.message)) throw e;
          await sleep(2000);
        }
      }
      sh.takes = sh.takes.filter((tk) => tk !== tmp && tk.n !== m.n).concat([m]).sort((a, b) => a.n - b.n);
      sh.sel = m.n;
      refresh(id);
      poll(id);
    } catch (e) {
      sh.takes = sh.takes.filter((tk) => tk !== tmp);
      refresh(id);
      toast(t("st.upload.err", { e: e.message || e }));
    } finally {
      delete S.uploads[id];
    }
  })();
  S.uploads[id] = p;
  return p;
}

const polling = new Set();
async function poll(id, wantGuide = false) {
  if (polling.has(id)) return;
  polling.add(id);
  const dir = S.data.project.dir;
  try {
    for (let i = 0; i < 300; i++) {
      await sleep(i < 4 ? 500 : 900);
      if (!S.data || S.data.project.dir !== dir) return;
      const st = await api(`/api/line/${encodeURIComponent(id)}${wantGuide ? "?guide=1" : ""}`);
      replaceShot(st);
      if (!st.takes.some((tk) => tk.status === "analyse") && (!wantGuide || st.guide || !st.gdur)) break;
    }
  } catch {
  } finally {
    polling.delete(id);
  }
}

function replaceShot(st) {
  const sh = byId(st.id);
  if (!sh) return;
  const pending = sh.takes.filter((tk) => tk.tmp);
  Object.assign(sh, st);
  sh.takes = st.takes.concat(pending);
  refresh(st.id);
  if (sh === cur() && !S.rec && !S.play) setStrip(bandWords(sh));
}

async function discardTake(n, restart) {
  const sh = cur();
  stopPlay();
  if (S.uploads[sh.id]) await S.uploads[sh.id];
  const real = realTakes(sh);
  if (n == null) n = real.length ? Math.max(...real.map((tk) => tk.n)) : null;
  if (n != null) {
    sh.takes = sh.takes.filter((tk) => tk.n !== n);
    refresh(sh.id);
    toast(t("st.discarded", { n }));
    post(`/api/discard/${encodeURIComponent(sh.id)}/${n}`).then(replaceShot);
  }
  if (restart) startRec();
}

async function selectTake(n) {
  const sh = cur();
  if (n != null && !realTakes(sh).some((tk) => tk.n === n)) return;
  sh.sel = n;
  refresh(sh.id);
  replaceShot(await post(n == null ? `/api/unselect/${encodeURIComponent(sh.id)}` : `/api/select/${encodeURIComponent(sh.id)}/${n}`));
  toast(n == null ? t(sh.gdur ? "tk.unkept.guide" : "tk.unkept") : t("st.kept", { n }));
}

// ------------------------------------------------------------------ listening
function stopPlay() {
  if (!S.play) return;
  film.pause();
  film.muted = true;
  player.pause();
  S.play = null;
  clearKaraoke();
  updateButtons();
  renderTakes();
  if (!S.rec && S.data && S.lines.length) setStrip(bandWords(cur()));
}

function playRythmo() {
  const sh = cur();
  stopPlay();
  const src = bandSource(sh);
  const words = src.words();
  const au = src.audio?.();
  const end = words.length ? words.at(-1).e + 0.6 : 2;
  if (au) {
    player.src = au.url;
    player.currentTime = au.a;
    if (hasFilm(sh) && S.film) {
      let started = false;
      film.muted = true;
      film.currentTime = Math.max(0, sh.film.vo - 1.2);
      film.play().catch(() => {});
      S.play = {
        kind: "guide", words,
        t: () => (started ? player.currentTime - au.a : film.currentTime - sh.film.vo),
        step: () => {
          if (!started && film.currentTime >= sh.film.vo) {
            started = true;
            player.currentTime = au.a;
            player.play().catch(() => {});
          }
        },
        done: () => started && player.ended,
      };
    } else {
      player.play().catch(() => {});
      S.play = { kind: "guide", words, t: () => player.currentTime - au.a, done: () => player.ended };
    }
  } else if (hasFilm(sh) && S.film) {     // no audio for this source: the band scrolls over the picture
    film.muted = true;
    film.currentTime = Math.max(0, sh.film.vo - 1.2);
    film.play().catch(() => {});
    S.play = { kind: "guide", words, t: () => film.currentTime - sh.film.vo, done: () => film.currentTime - sh.film.vo > end };
  } else {
    const t0 = performance.now();
    S.play = { kind: "guide", words, t: () => (performance.now() - t0) / 1000 - 1, done: () => (performance.now() - t0) / 1000 - 1 > end };
  }
  setStrip(words);
  updateButtons();
}

// A take is heard as it goes into the track (trimmed, denoised, pauses shortened, at its tempo) when it is the kept one;
// raw otherwise, or on demand ("raw" = the recording as it is).
function playTake(n, onFilm = false, raw = false) {
  const sh = cur();
  const tk = n != null ? sh.takes.find((x) => x.n === n) : selTake(sh) || realTakes(sh).at(-1);
  if (!tk || tk.tmp) return;
  stopPlay();
  const asTrack = !raw && tk.n === sh.sel && !!sh.export && tk.status === "ok";
  const tr = asTrack ? takeTrack(sh, tk) : null;
  const [a, b] = asTrack ? [0, 1e9] : tk.trim || [0, tk.dur || 1e9];
  player.src = asTrack ? tr.audio.url : `/takes/${encodeURIComponent(sh.id)}/${tk.file}?v=${encodeURIComponent(tk.created || "")}`;
  player.currentTime = Math.max(0, a - (asTrack ? 0 : 0.05));
  const words = asTrack ? tr.words : fixWords(tk.heard || [], tk.pauses);
  const kind = raw ? "raw" : onFilm ? "film" : "take";
  if (onFilm && hasFilm(sh)) {
    let started = false;
    film.muted = true;
    film.currentTime = Math.max(0, sh.film.vo - 1.2);
    film.play().catch(() => {});
    S.play = {
      kind, n: tk.n, words,
      t: () => (started ? player.currentTime : film.currentTime - sh.film.vo + a),
      step: () => {
        if (!started && film.currentTime >= sh.film.vo) {
          started = true;
          player.currentTime = a;
          player.play().catch(() => {});
        }
      },
      done: () => started && (player.ended || player.currentTime >= b + 0.3),
    };
  } else {
    player.play().catch(() => {});
    S.play = { kind, n: tk.n, words, t: () => player.currentTime, done: () => player.ended || player.currentTime >= b };
  }
  setStrip(words);
  updateButtons();
  renderTakes();
}

function playRaw() {
  const sh = cur();
  const tk = selTake(sh) || realTakes(sh).at(-1);
  if (tk) playTake(tk.n, false, true);
}

// ------------------------------------------------------------------ tools: synthetic take, band source, duration
function studioVoices() {
  return (G.app.voices || []).filter((v) => v.ref);
}

function renderTools() {
  if (!S.data || !S.lines.length) return;
  const sh = cur();
  const vs = studioVoices();
  const tv = $("#t-voice");
  const lang = S.data.project.lang;
  const want = LS.get("tvoice:" + S.data.project.dir, null) || (typeof S.data.project.voice === "string" ? S.data.project.voice : null);
  tv.innerHTML = vs.map((v) => `<option value="${esc(v.id)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join("") || `<option value="">${esc(t("tl.novoice"))}</option>`;
  tv.value = vs.some((v) => v.id === want) ? want : (vs.find((v) => v.lang === lang) || vs[0] || {}).id || "";
  $("#b-gen").disabled = !vs.length || !G.app.engine.available || !!S.gen[sh.id];
  $("#b-gen").title = !G.app.engine.available ? t("sy.notinstalled") : !vs.length ? t("tl.novoice") : t("tl.gen.t");
  // band source
  const list = sources(sh), src = bandSource(sh), want2 = LS.get(srcKey(), "auto");
  $("#t-src").innerHTML = `<option value="auto">${esc(t("src.auto", { x: src.label }))}</option>` + list.map((o) => `<option value="${o.key}">${esc(o.label)}</option>`).join("");
  $("#t-src").value = list.some((o) => o.key === want2) ? want2 : "auto";
  const lp = linePace(sh), pp = projectPace();
  $("#t-pace").classList.toggle("on", src.key === "pace");
  $("#t-pval").textContent = t("tl.pace.val", { w: Math.round(lp.wpm) });
  $("#t-pval").title = t("tl.pace.t", { p: Math.round(pp.wpm), how: t("pace." + pp.how, { n: pp.n }) });
  $("#t-preset").style.display = $("#t-pall").style.display = lp.how === "line" ? "" : "none";
  // image: where the line starts in the video
  $("#t-imgrow").style.display = S.data.film ? "" : "none";
  $("#t-pos").textContent = sh.film ? t("tl.pos", { t: fmt(sh.film.vo), s: (sh.slot ?? sh.film.dur).toFixed(1) }) : t("tl.unplaced");
  // duration of the kept take
  const tk = selTake(sh);
  const ok = !!(tk && tk.status === "ok");
  ["#t-shorter", "#t-longer", "#t-reset"].forEach((q) => ($(q).disabled = !ok));
  $("#t-reset").disabled = !ok || tempoOf(tk) === 1;
  if (ok) {
    const d0 = speechDur(tk), d1 = effDur(tk);
    $("#t-dur").innerHTML = Math.abs(d1 - d0) < 0.05 ? `${d0.toFixed(1)} s` : `${d0.toFixed(1)} → <b>${d1.toFixed(1)} s</b>`;
  } else $("#t-dur").textContent = t("tl.nokept");
  $("#t-pcap").disabled = !ok || !tk.pauses;
  $("#t-pcap").value = ok && tk.pause_cap ? String(tk.pause_cap) : "";
  $("#t-pinfo").innerHTML = !ok ? "" : !tk.pauses ? `<span class="spin"></span>`
    : t("tl.pinfo", { n: tk.pauses.length, s: cutTotal(tk).toFixed(2), d: (tk.pause_drop || []).length });
  const fits = [];
  if (sh.slot) fits.push([t("tl.fitslot", { s: sh.slot.toFixed(1) }), sh.slot]);
  const syn = lastSynth(sh);
  if (syn && syn !== tk) fits.push([t("tl.fitsynth", { s: speechDur(syn).toFixed(1) }), speechDur(syn)]);
  else if (sh.gdur) fits.push([t("tl.fitguide", { s: sh.gdur.toFixed(1) }), sh.gdur]);
  ["#t-fit1", "#t-fit2"].forEach((q, i) => {
    const b = $(q);
    b.style.display = fits[i] ? "" : "none";
    if (!fits[i]) return;
    b.textContent = fits[i][0];
    b.disabled = !ok;
    b.onclick = () => setTempo((speechDur(tk) - cutTotal(tk)) / fits[i][1]);
  });
}

async function setTempo(f) {
  const sh = cur();
  const tk = selTake(sh);
  if (!tk || tk.status !== "ok") return;
  f = clamp(f, 0.7, 1.4);
  if (Math.abs(f - 1) < 0.004) f = 1;
  replaceShot(await post(`/api/tempo/${encodeURIComponent(sh.id)}/${tk.n}`, { tempo: f }));
  toast(f === 1 ? t("tl.tempo.reset") : t(Math.abs(f - 1) > 0.2 ? "tl.tempo.far" : "tl.tempo.set", { s: ((speechDur(tk) - cutTotal(tk)) / f).toFixed(1), f: f.toFixed(2) }));
}

async function setPauses(tk, body) {
  const sh = cur();
  replaceShot(await post(`/api/pauses/${encodeURIComponent(sh.id)}/${tk.n}`, body));
}

// where lines sit in the video: "Place here" puts the line's start at the picture's current time (the previous line now ends
// there); "Place the rest" lays this line and the following ones one after the other, each for its estimated duration
function layoutFrom(i0, t0) {
  const set = {};
  let x = t0;
  for (let i = i0; i < S.lines.length; i++) {
    const d = paceDur(S.lines[i]) + 0.6;
    set[S.lines[i].id] = { start: x, vo: x, dur: d };
    x += d;
  }
  return set;
}

async function placeHere() {
  if (!S.data?.film || S.rec) return;
  const sh = cur(), now = film.currentTime;
  const others = S.lines.filter((l) => l.film && l !== sh);
  const prev = others.filter((l) => l.film.vo < now).sort((a, b) => b.film.vo - a.film.vo)[0];
  const next = others.filter((l) => l.film.vo > now).sort((a, b) => a.film.vo - b.film.vo)[0];
  const set = { [sh.id]: { start: now, vo: now, dur: next ? next.film.start - now : paceDur(sh) + 0.6 } };
  if (prev) set[prev.id] = { ...prev.film, dur: Math.max(0.2, now - prev.film.start) };
  applyState(await post("/api/timing", { set }));
  toast(t("tl.placed", { id: sh.id, t: fmt(now) }));
}

async function placeFollowing() {
  if (!S.data?.film || S.rec) return;
  const sh = cur();
  if (!confirmTwice($("#t-imgrow"), t("tl.follow.confirm"))) return;
  const t0 = sh.film ? sh.film.vo : film.currentTime;
  applyState(await post("/api/timing", { set: layoutFrom(S.cur, t0) }));
  toast(t("tl.followed", { n: S.lines.length - S.cur, t: fmt(t0) }));
}

S.gen = {};
async function genSynth() {
  if (!S.data || !S.lines.length || S.rec) return;
  const sh = cur();
  const vid = $("#t-voice").value;
  if (!vid || !G.app.engine.available) return toast(!G.app.engine.available ? t("sy.notinstalled") : t("tl.novoice"));
  if (S.gen[sh.id]) return;
  const name = studioVoices().find((v) => v.id === vid)?.name || vid;
  S.gen[sh.id] = { voice: name, label: t(G.app.engine.loaded ? "sy.queued" : "sy.loading") };
  refresh(sh.id);
  try {
    const job = await post("/api/synthtakes", { voice: vid, ids: [sh.id] });
    watchJob(job, {
      onProgress: (j) => {
        if (!S.gen[sh.id]) return;
        S.gen[sh.id].label = j.progress?.sentence ? t("sy.progress", { s: j.progress.sentence, n: j.progress.sentences, d: j.progress.draw, of: j.progress.draws }) : t(j.status === "running" ? "sy.loading" : "sy.queued");
        if (sh === cur()) renderTakes();
      },
      onDone: async (res) => {
        delete S.gen[sh.id];
        G.app.engine.loaded = true;
        replaceShot(await api(`/api/line/${encodeURIComponent(sh.id)}`));
        const r = res.takes[0];
        toast(r.kept ? t("tl.gen.kept", { n: r.n }) : t("tl.gen.added", { n: r.n }), 4000);
      },
      onError: (e) => {
        delete S.gen[sh.id];
        refresh(sh.id);
        toast(t("err", { e }));
      },
    });
  } catch (e) {
    delete S.gen[sh.id];
    refresh(sh.id);
    toast(t("err", { e: e.message }));
  }
}

// ------------------------------------------------------------------ rythmo band and karaoke
function estimate(tok, dur) {
  const wt = tok.map((x) => x.t.replace(/[^\p{L}\p{N}]/gu, "").length + 2);
  const pause = tok.map((x) => (x.p ? 5 : /,$/.test(x.t) ? 2 : 0));      // a sentence end weighs 5 letters, a comma 2
  const total = wt.reduce((a, b) => a + b, 0) + pause.reduce((a, b) => a + b, 0) || 1;
  const k = Math.max(0.3, dur - 0.2) / total;
  let x = 0.1;
  return tok.map((tk, i) => {
    const s = x;
    x += wt[i] * k;
    const w = { t: tk.t, s, e: x - 0.04 };
    x += pause[i] * k;
    return w;
  });
}

function guideWords(sh) {
  if (sh.guide && sh.guide.length === sh.tok.length) return sh.guide;
  return estimate(sh.tok, sh.gdur && sh.gtext === sh.text ? sh.gdur : sh.tok.length / 2.45 + 0.4);
}

// Where the rythmo band takes its timing from: the kept take (the words Whisper heard, with their times), the synthetic
// take, the imported synthesis, the shot's duration in the video, or an average speaking rate.
const LETTER = /[\p{L}\p{N}]/u;
const tempoOf = (tk) => tk?.tempo || 1;
const speechDur = (tk) => tk.trim[1] - tk.trim[0];
// shortened pauses (same rule as the server): a pause longer than the cap is cut down to it, a removed one to 0.08 s
const PAUSE_KEEP = 0.08;
function cutsOf(tk) {
  const drop = new Set((tk.pause_drop || []).map((x) => x.toFixed(2)));
  const out = [];
  for (const [s, e] of tk.pauses || []) {
    const keep = drop.has(s.toFixed(2)) ? PAUSE_KEEP : tk.pause_cap ? Math.max(PAUSE_KEEP, tk.pause_cap) : null;
    if (keep != null && e - s > keep) out.push([s + keep / 2, e - keep / 2]);
  }
  return out;
}
// Whisper often starts the word after a pause inside the pause (its span then covers the silence): such a word starts
// where the pause ends; a word whose span runs into a following pause ends where the pause starts.
function fixWords(words, pauses) {
  if (!pauses?.length) return words;
  return words.map((w) => {
    let { s, e } = w;
    for (const [ps, pe] of pauses) {
      if (ps >= s - 0.05 && pe <= e + 0.05 && pe > s) {
        if (ps - s < 0.3) s = Math.min(pe, e - 0.05);
        else if (e - pe < 0.3) e = Math.max(ps, s + 0.05);
      }
    }
    return { ...w, s, e };
  });
}
const removedBefore = (cuts, x) => cuts.reduce((acc, [cs, ce]) => acc + Math.min(Math.max(x - cs, 0), ce - cs), 0);
const cutTotal = (tk) => cutsOf(tk).reduce((acc, [cs, ce]) => acc + ce - cs, 0);
const effDur = (tk) => (speechDur(tk) - cutTotal(tk)) / tempoOf(tk);   // as it sounds in the track
const lastSynth = (sh) => sh.takes.filter((x) => !x.tmp && x.kind === "synth" && x.status === "ok").at(-1);
const srcKey = () => "rsrc:" + S.data.project.dir;
function takeTrack(sh, tk) {
  // the kept take is heard as exported (trimmed, at its tempo); another take raw, from its speech start
  const exp = tk.n === sh.sel && sh.export;
  const a = tk.trim[0], f = exp ? tempoOf(tk) : 1;
  const cuts = exp ? cutsOf(tk).map(([cs, ce]) => [cs - a, ce - a]) : [];
  const at = (x) => { const r = Math.max(0, x - a); return (r - removedBefore(cuts, r)) / f; };
  return {
    words: fixWords((tk.heard || []).filter((w) => LETTER.test(w.t)), tk.pauses).map((w) => ({ t: w.t, s: at(w.s), e: at(w.e) })),
    audio: exp ? { url: `/export/${encodeURIComponent(sh.id)}.wav?v=${encodeURIComponent(sh.export)}`, a: 0 }
      : { url: `/takes/${encodeURIComponent(sh.id)}/${tk.file}?v=${encodeURIComponent(tk.created || "")}`, a },
    dur: exp ? effDur(tk) : speechDur(tk),
  };
}
function sources(sh) {
  const out = [];
  const kept = selTake(sh);
  if (kept && kept.status === "ok") {
    const tr = takeTrack(sh, kept);
    out.push({ key: "take", label: t(kept.kind === "synth" ? "src.takesynth" : "src.take", { n: kept.n, s: tr.dur.toFixed(1) }), words: () => tr.words, audio: () => tr.audio });
  }
  const syn = lastSynth(sh);
  if (syn && syn !== kept) {
    const tr = takeTrack(sh, syn);
    out.push({ key: "synth", label: t("src.synth", { v: syn.voiceName || syn.voice, s: tr.dur.toFixed(1) }), words: () => tr.words, audio: () => tr.audio });
  }
  if (sh.gdur) out.push({ key: "guide", label: t("src.guide", { s: sh.gdur.toFixed(1) }), words: () => guideWords(sh),
    audio: () => ({ url: `/guide/${encodeURIComponent(sh.id)}.wav?v=${encodeURIComponent(sh.gtext || "")}`, a: 0 }) });
  if (sh.slot) out.push({ key: "slot", label: t("src.slot", { s: sh.slot.toFixed(1) }), words: () => estimate(sh.tok, sh.slot) });
  const pd = paceDur(sh);
  out.push({ key: "pace", label: t("src.pace", { w: linePace(sh).wpm, s: pd.toFixed(1) }), words: () => estimate(sh.tok, pd) });
  return out;
}
// Speaking rate for the estimated band: the line's own, else the project's (set by hand, else measured on the kept
// microphone takes, 3 at least), else 147 words per minute.
const DEFAULT_WPM = 147;
function measuredPace() {
  let w = 0, d = 0, n = 0;
  for (const sh of S.lines) {
    const tk = selTake(sh);
    if (!tk || tk.status !== "ok" || tk.kind === "synth" || !tk.heard) continue;
    const k = tk.heard.filter((x) => LETTER.test(x.t)).length, dd = effDur(tk) - 0.4;
    if (k && dd > 0.5) {
      w += k;
      d += dd;
      n++;
    }
  }
  return n >= 3 ? { wpm: Math.round((60 * w) / d), n } : null;
}
function projectPace() {
  const p = S.data.settings.pace || {};
  if (p.default) return { wpm: p.default, how: "set" };
  const m = measuredPace();
  return m ? { wpm: m.wpm, how: "measured", n: m.n } : { wpm: DEFAULT_WPM, how: "default" };
}
function linePace(sh) {
  const v = S.data.settings.pace?.lines?.[sh.id];
  return v ? { wpm: v, how: "line" } : projectPace();
}
const paceDur = (sh) => sh.tok.length / (linePace(sh).wpm / 60) + 0.4;

async function setPace(id, wpm) {
  applyState(await post("/api/pace", { id, wpm }));
}

function bandSource(sh) {
  const list = sources(sh);
  const want = LS.get(srcKey(), "auto");
  return list.find((x) => x.key === want) || ["synth", "guide", "take", "slot", "pace"].map((k) => list.find((x) => x.key === k)).find(Boolean);
}
const bandWords = (sh) => bandSource(sh).words();

let stripWords = [], stripEls = [], stripIdx = -2;
function setStrip(words) {
  const strip = $("#strip");
  strip.innerHTML = "";
  stripWords = words;
  stripEls = [];
  stripIdx = -2;
  measure.font = FONTSTR();
  let right = -1e9;
  words.forEach((w, i) => {
    const nat = measure.measureText(w.t).width || 1;
    const next = i + 1 < words.length ? words[i + 1].s : w.e + 0.5;
    const avail = Math.max(0.05, Math.min(next, Math.max(w.e, w.s + 0.12) + 0.2) - w.s) * S.pxs - 12;
    const sx = clamp(avail / nat, 0.62, 1);
    const left = Math.max(w.s * S.pxs, right + 10);
    const ln = el("i", "rl");
    ln.style.left = w.s * S.pxs + "px";
    ln.style.width = Math.max(4, (w.e - w.s) * S.pxs) + "px";
    const sp = el("span", "rw" + (w.st && w.st !== "ok" ? " " + w.st : ""), esc(w.t));
    sp.style.left = left + "px";
    sp.style.transform = `scaleX(${sx.toFixed(3)})`;
    strip.append(ln, sp);
    stripEls.push(sp);
    right = left + nat * sx;
  });
  moveStrip(words.length ? Math.min(-0.25, words[0].s - 0.25) : 0);
}

function moveStrip(tm) {
  const barX = $("#rythmo").clientWidth * 0.22;
  $("#strip").style.transform = `translateX(${(barX - tm * S.pxs).toFixed(1)}px)`;
  let i = -1;
  for (let k = 0; k < stripWords.length && stripWords[k].s <= tm; k++) i = k;
  if (i !== stripIdx) {
    stripEls.forEach((e, k) => {
      e.classList.toggle("past", k < i);
      e.classList.toggle("now", k === i);
    });
    stripIdx = i;
  }
}

let kIdx = -2;
function curSpans() {
  return S.mode === "texte" ? [...document.querySelectorAll("#script .shot.cur .w")] : [...document.querySelectorAll("#curtext .w")];
}
function karaoke(words, tm) {
  const spans = curSpans();
  if (spans.length !== words.length) return;
  let i = -1;
  for (let k = 0; k < words.length && words[k].s <= tm; k++) i = k;
  if (i === kIdx) return;
  spans.forEach((e, k) => {
    e.classList.toggle("said", k < i);
    e.classList.toggle("now", k === i);
  });
  kIdx = i;
}
function clearKaraoke() {
  curSpans().forEach((e) => e.classList.remove("said", "now"));
  kIdx = -2;
}

function tick() {
  requestAnimationFrame(tick);
  const sh = S.data && S.lines.length ? cur() : null;
  if (!sh) return;
  if (hasFilm(sh) && S.film) $("#filmtc").textContent = fmt(film.currentTime);
  let tm = null, words = null;
  if (S.rec && !S.rec.stopping) {
    $("#rectime").textContent = fmt(S.ctx.currentTime - S.rec.t0);
    if (S.rec.clock) {
      tm = S.rec.clock();
      words = S.rec.words;
      const first = words.length ? words[0].s : 0;
      $("#count").textContent = tm < first - 0.05 ? `${Math.ceil(first - tm)}` : "";
    }
  } else if (S.play) {
    S.play.step?.();
    tm = S.play.t();
    words = S.play.words;
    if (S.play.done()) return stopPlay();
  }
  if (tm != null) {
    if (S.mode === "rythmo") moveStrip(tm);
    if (words && (S.rec || S.play.kind === "guide")) karaoke(words, tm);
  }
}

// ------------------------------------------------------------------ rendering
function paraHTML(sh) {
  return sh.tok.map((x, i) => `<span class="w">${esc(x.t)}</span>${x.p && i < sh.tok.length - 1 ? ' <span class="br">/</span>' : ""}`).join(" ");
}

function badge(sh) {
  const real = realTakes(sh);
  const tk = selTake(sh);
  if (S.gen[sh.id] || sh.takes.some((x) => x.tmp || x.status === "analyse")) return { cls: "", html: '<span class="spin"></span>' };
  const mark = tk?.kind === "synth" ? "✦" : "●";
  if (tk && tk.status === "ok") return { cls: tk.clips ? "voice warn" : "voice", html: real.length > 1 ? `${mark} ${real.length}` : mark };
  return { cls: "", html: real.length ? String(real.length) : "" };
}

const chapTitle = (ch) => (S.data.chapters.length > 1 || S.data.chapters[ch].title ? `${ch} · ${esc(S.data.chapters[ch].title)}` : null);

function buildNav() {
  const nav = $("#nav");
  nav.innerHTML = "";
  const todo = S.data.todo || [];
  if (todo.length) {
    nav.append(el("h3", "todo-h", esc(t("st.todo", { n: todo.length }))));
    todo.forEach((id) => {
      const i = S.lines.findIndex((sh) => sh.id === id);
      if (i < 0) return;
      const it = el("div", "ni todo", `<span class="id">${esc(id)}</span><span class="tx">${esc(S.lines[i].text)}</span>`);
      it.onclick = () => go(i);
      nav.append(it);
    });
  }
  let ch = -1;
  S.lines.forEach((sh, i) => {
    if (sh.ch !== ch) {
      ch = sh.ch;
      const title = chapTitle(ch);
      if (title) nav.append(el("h3", null, title));
    }
    const it = el("div", todo.includes(sh.id) ? "ni todo" : "ni", `<span class="id">${esc(sh.id)}</span><span class="tx">${esc(sh.text)}</span><span class="bd"></span>`);
    it.id = "n-" + sh.id;
    it.onclick = () => go(i);
    nav.append(it);
    navBadge(sh);
  });
}

function navBadge(sh) {
  const it = document.getElementById("n-" + sh.id);
  if (!it) return;
  const b = badge(sh);
  it.classList.remove("voice", "warn");
  if (b.cls) it.classList.add(...b.cls.split(" "));
  it.querySelector(".bd").innerHTML = b.html;
}

function buildScript() {
  const box = $("#script");
  box.innerHTML = "";
  if (S.data.project.kind === "voice") box.append(protocolCard());
  if (!S.lines.length) box.append(el("p", "empty", esc(t("st.noline"))));
  let ch = -1;
  S.lines.forEach((sh, i) => {
    if (sh.ch !== ch) {
      ch = sh.ch;
      const title = chapTitle(ch);
      if (title) box.append(el("div", "chap", title));
    }
    const d = el("div", (S.data.todo || []).includes(sh.id) ? "shot todo" : "shot", `<div class="sh-h"><span class="sid" data-todo=" · ${esc(t("st.todo1"))}">${esc(sh.id)}</span><span class="st"></span>
      <span class="acts"><button data-a="edit" title="${esc(t("ed.edit.t"))}">✎ ${t("ed.edit")}</button><button data-a="add" title="${esc(t("ed.add.t"))}">+ ${t("ed.add")}</button><button data-a="del" title="${esc(t("ed.del.t"))}">🗑</button></span></div><p>${paraHTML(sh)}</p>`);
    d.id = "s-" + sh.id;
    d.onclick = (e) => !e.target.closest(".editor") && go(i);
    d.querySelectorAll(".acts button").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      lineAction(b.dataset.a, b.closest(".shot"));
    }));
    box.append(d);
    shotStatus(sh);
  });
}

// the capture protocol of a voice, above its sample sentences
function protocolCard() {
  const vid = S.data.project.dir.split("/").filter(Boolean).at(-1);
  const v = (G.app.voices || []).find((x) => x.id === vid);
  const n = S.lines.filter((l) => selTake(l)?.status === "ok").length;
  const c = el("div", "protocol", `<h2>${esc(t("pr.title", { name: S.data.project.name }))}</h2>${t("pr.steps")}
    <div class="row"><span>${esc(t("pr.kept", { n, of: S.lines.length }))}</span>
    ${v?.ref ? `<span class="ok">${esc(t("pr.ref", { s: v.refDur, d: v.refDate }))}</span>` : `<span class="warn">${esc(t("pr.noref"))}</span>`}
    <span class="spacer"></span><button class="primary" id="pr-build">${t("pr.build")}</button><button id="pr-try">${t("pr.try")}</button></div>`);
  c.onclick = (e) => e.stopPropagation();
  c.querySelector("#pr-build").onclick = async () => {
    try {
      c.querySelector("#pr-build").disabled = true;
      await post(`/api/voices/${encodeURIComponent(vid)}/build`);
      await refreshApp();
      toast(t("pr.built"));
      buildScript();
      go(S.cur, true);
    } catch (e) {
      toast(t("err", { e: e.message }));
      c.querySelector("#pr-build").disabled = false;
    }
  };
  c.querySelector("#pr-try").onclick = () => {
    LS.set("synth.voice", vid);
    setView("synth");
  };
  return c;
}

function shotStatus(sh) {
  const d = document.getElementById("s-" + sh.id);
  if (!d) return;
  const tk = selTake(sh);
  const n = realTakes(sh).length;
  d.querySelector(".st").textContent = tk && tk.status === "ok" ? t(tk.kind === "synth" ? "st.status.synth" : "st.status.mic", { n: tk.n, v: tk.voiceName || "" }) + (n > 1 ? " · " + t("st.ntakes", { n }) : "")
    : n ? t("st.ntakes", { n }) : "";
  d.querySelector("p").innerHTML = paraHTML(sh);
}

function renderCurText() {
  if (G.editing) return;
  $("#curtext").innerHTML = `<div class="curacts"><button data-a="edit" title="${esc(t("ed.edit.t"))}">✎ ${t("ed.edit")}</button><button data-a="add" title="${esc(t("ed.add.t"))}">+ ${t("ed.add")}</button><button data-a="del" title="${esc(t("ed.del.t"))}">🗑</button></div><p>${paraHTML(cur())}</p>`;
  $("#curtext").querySelectorAll(".curacts button").forEach((b) => (b.onclick = () => lineAction(b.dataset.a, $("#curtext"))));
}

// ------------------------------------------------------------------ editing the text: the current line, a new line after it
function lineAction(a, box) {
  if (a === "edit") editLine();
  else if (a === "add") editLine(true);
  else if (a === "del" && confirmTwice(box, t("ed.del.confirm"))) deleteLine();
}

function editLine(add = false) {
  if (!S.data || !S.lines.length || S.rec || G.editing) return;
  stopPlay();
  const sh = cur();
  G.editing = true;
  let host, restore;
  if (S.mode === "texte") {
    const card = document.getElementById("s-" + sh.id);
    if (add) {
      host = el("div", "shot newline", `<div class="sh-h"><span class="sid">${esc(t("ed.new"))}</span></div>`);
      card.after(host);
      restore = () => host.remove();
    } else {
      host = card;
      const p = card.querySelector("p");
      p.style.display = "none";
      restore = () => {
        p.style.display = "";
        host.querySelector(".editor")?.remove();
      };
    }
  } else {
    host = $("#curtext");
    host.innerHTML = "";
    restore = () => {};
  }
  const ed = el("div", "editor");
  const ta = el("textarea");
  ta.value = add ? "" : sh.text;
  ta.placeholder = t("ed.ph");
  const bar = el("div", "row", `<button class="primary">${t("ed.save")}</button><button>${t("ed.cancel")}</button><span class="muted">${t("ed.hint")}</span>${S.data.scriptFrom ? `<span class="warn">${esc(t("ed.from", { f: S.data.scriptFrom }))}</span>` : ""}`);
  ed.append(ta, bar);
  host.append(ed);
  const fit = () => {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + 4 + "px";
  };
  const close = () => {
    G.editing = false;
    restore();
    renderCurText();
  };
  const save = async () => {
    const text = ta.value.trim();
    if (!text) return close();
    try {
      if (add) {
        const st = await post("/api/line/add", { after: sh.id, text });
        G.editing = false;
        applyState(st, st.added);
        toast(t("ed.added", { id: st.added }));
      } else {
        if (text !== sh.text) {
          G.editing = false;
          applyState(await post(`/api/line/${encodeURIComponent(sh.id)}/edit`, { text }));
          toast(t("ed.saved"));
        } else close();
      }
    } catch (e) {
      toast(t("err", { e: e.message }));
    }
  };
  bar.children[0].onclick = save;
  bar.children[1].onclick = close;
  ta.addEventListener("input", fit);
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
  requestAnimationFrame(() => {
    fit();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    if (S.mode === "texte") host.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

async function deleteLine() {
  const sh = cur();
  const next = S.lines[S.cur + 1] || S.lines[S.cur - 1];
  applyState(await post(`/api/line/${encodeURIComponent(sh.id)}/delete`), next?.id);
  toast(t("ed.deleted", { id: sh.id }));
}

function renderInfo() {
  const sh = cur();
  const parts = [t("st.line", { i: S.cur + 1, n: S.lines.length }), `<b>${esc(sh.id)}</b>`];
  const ct = chapTitle(sh.ch);
  if (ct) parts.push(ct);
  if (sh.film) parts.push(t("st.infilm", { t: fmt(sh.film.vo) }));
  if (sh.slot) parts.push(t("st.slot", { s: sh.slot.toFixed(1) }));
  const tk = selTake(sh);
  if (tk && tk.trim) parts.push(`<b>${t(tk.kind === "synth" ? "st.keptsynth" : "st.keptmic", { n: tk.n, s: effDur(tk).toFixed(1) })}</b>`);
  else parts.push(`<span class="warn">${t(sh.gdur ? "st.nokept.guide" : "st.nokept")}</span>`);
  if (sh.gdur && sh.gtext && sh.gtext !== sh.text && bandSource(sh).key === "guide") parts.push(`<span class="warn">${t("st.guideold")}</span>`);
  if (sh.note) parts.push(`<span class="warn">${esc(sh.note)}</span>`);
  $("#info").innerHTML = parts.join(" · ");
}

function progress() {
  let n = 0, k = 0, dur = 0;
  for (const sh of S.lines) {
    const tk = selTake(sh);
    if (tk && tk.status === "ok") {
      if (tk.kind === "synth") k++;
      else n++;
      dur += effDur(tk);
    }
  }
  $("#prog").innerHTML = t("st.prog", { n, of: S.lines.length }) + (k ? " · " + t("st.prog.synth", { k }) : "") + (n + k ? ` · ${fmt(dur).replace(/\.\d$/, "")}` : "");
}

function renderTakes() {
  if (!S.data || !S.lines.length) return;
  const sh = cur();
  const box = $("#takes");
  box.innerHTML = "";
  if (S.gen[sh.id]) box.append(el("div", "take synth", `<div class="th"><b>${t("tk.synthnew")}</b><span class="kind">✦ ${esc(S.gen[sh.id].voice)}</span></div>
    <div class="ti"><span class="spin"></span> ${esc(S.gen[sh.id].label)}</div>`));
  if (!sh.takes.length && !S.gen[sh.id]) {
    box.append(el("div", "empty", t("st.notake")));
    return;
  }
  [...sh.takes].sort((a, b) => (b.tmp ? 1e12 : b.n) - (a.tmp ? 1e12 : a.n)).forEach((tk) => box.append(takeCard(sh, tk)));
  if (sh.sel == null && sh.takes.length) box.prepend(el("div", "empty", t("st.keepone")));
}

function takeCard(sh, tk) {
  const c = el("div", "take" + (sh.sel === tk.n && !tk.tmp ? " sel" : "") + (tk.kind === "synth" ? " synth" : "") + (S.play && S.play.n === tk.n ? " playing" : ""));
  if (tk.tmp) {
    c.innerHTML = `<div class="th"><b>${t("tk.new")}</b></div><div class="ti"><span class="spin"></span> ${t("tk.sending")}</div>`;
    return c;
  }
  const head = el("div", "th", `<b>${t("tk.take", { n: tk.n })}</b><span class="kind">${tk.kind === "synth" ? "✦ " + esc(tk.voiceName || tk.voice) : "🎙 " + t("tk.mic")}</span><span class="when">${esc((tk.created || "").slice(11, 16))}</span>${sh.sel === tk.n ? `<span class="star" title="${esc(t("tk.unkeep.t"))}">★ ${t("tk.kept")}</span>` : ""}`);
  head.querySelector(".star")?.addEventListener("click", () => confirmTwice(head, t(sh.gdur ? "tk.unkeep.guide" : "tk.unkeep.empty")) && selectTake(null));
  c.append(head);
  const cv = el("canvas");
  cv.width = 520;
  cv.height = 80;
  const pauseAt = (ev) => {
    if (!tk.pauses || !tk.dur || tk.n !== sh.sel) return null;  // pauses are edited on the kept take, the one in the track
    const r = cv.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * tk.dur, tol = (4 / r.width) * tk.dur;
    return tk.pauses.find(([s, e]) => x >= s - tol && x <= e + tol) || null;
  };
  cv.onclick = async (ev) => {
    const p = pauseAt(ev);
    if (!p) return playTake(tk.n);
    const was = (tk.pause_drop || []).some((x) => x.toFixed(2) === p[0].toFixed(2));
    await setPauses(tk, { toggle: p[0] });
    toast(t(was ? "tl.pause.back" : "tl.pause.cut", { s: (p[1] - p[0]).toFixed(2) }), 3500);
  };
  cv.onmousemove = (ev) => {
    const p = pauseAt(ev);
    cv.style.cursor = p ? "pointer" : "default";
    cv.title = p ? t("tl.pause.t", { s: (p[1] - p[0]).toFixed(2) }) : t(tk.n === sh.sel ? "tk.wave.t" : "tk.wave.other.t");
  };
  c.append(cv);
  drawWave(cv, tk);
  const info = el("div", "ti");
  if (tk.status === "analyse") info.innerHTML = `<span class="spin"></span> ${t("tk.analysing")}`;
  else if (tk.status === "erreur") info.innerHTML = `<span class="chip bad">${t("tk.error")}</span> ${esc(tk.error || "")}`;
  else {
    const chips = [`<span>${effDur(tk).toFixed(1)} s</span>`];
    if (tempoOf(tk) !== 1) chips.push(`<span class="chip mid" title="${esc(t("tk.tempo.t"))}">×${tempoOf(tk).toFixed(2)}</span>`);
    if (cutTotal(tk) > 0.01) chips.push(`<span class="chip mid" title="${esc(t("tk.cut.t"))}">−${cutTotal(tk).toFixed(2)} s</span>`);
    if (tk.kind === "synth") chips.push(tk.worst ? `<span class="chip mid">${t("tk.relisten")}</span>` : `<span class="chip good">${t("tk.checked")}</span>`);
    else if (tk.clips) chips.push(`<span class="chip bad">${t("tk.clipping")}</span>`);
    else if (tk.peak_db < -24) chips.push(`<span class="chip mid">${t("tk.low", { db: tk.peak_db })}</span>`);
    else chips.push(`<span class="chip good">${t("tk.peak", { db: tk.peak_db })}</span>`);
    info.innerHTML = chips.join("");
  }
  c.append(info);
  if (tk.status === "ok" && tk.asr) {
    const h = el("div", "heard", esc(tk.asr));
    h.title = tk.asr;
    c.append(h);
  }
  const tb = el("div", "tb");
  const bt = (label, fn, title) => {
    const b = el("button", null, label);
    b.title = title || "";
    b.onclick = fn;
    tb.append(b);
  };
  const kept = sh.sel === tk.n && tk.status === "ok" && !!sh.export;
  const on = S.play && S.play.n === tk.n && S.play.kind !== "raw";
  bt(on ? "■" : "▶", () => (on ? stopPlay() : playTake(tk.n)), t(kept ? "tk.play.track.t" : "tk.raw.t"));
  if (kept) {
    const rawOn = S.play && S.play.n === tk.n && S.play.kind === "raw";
    bt(rawOn ? "■ " + t("tk.raw") : "▶ " + t("tk.raw"), () => (rawOn ? stopPlay() : playTake(tk.n, false, true)), t("tk.raw.t"));
  }
  if (hasFilm(sh)) bt("▶ " + t("tk.film"), () => playTake(tk.n, true), t("st.film.t"));
  if (sh.sel !== tk.n) bt("★ " + t("tk.keep"), () => selectTake(tk.n), t("tk.keep.t", { n: tk.n }));
  bt("🗑", () => discardTake(tk.n, false), t("tk.discard.t"));
  c.append(tb);
  return c;
}

function drawWave(cv, tk) {
  const g = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  if (!tk.peaks || !tk.dur) {
    g.fillStyle = "#1d2731";
    g.fillRect(0, H / 2 - 1, W, 2);
    return;
  }
  const [a, b] = tk.trim;
  const n = tk.peaks.length;
  const X = (sec) => (sec / tk.dur) * W;
  for (const [s, e] of tk.pauses || []) {              // pauses: a light band; the part removed in red
    g.fillStyle = "rgba(245,165,36,.13)";
    g.fillRect(X(s), 0, Math.max(3, X(e) - X(s)), H);
  }
  for (const [cs, ce] of cutsOf(tk)) {
    g.fillStyle = "rgba(239,68,68,.35)";
    g.fillRect(X(cs), 0, Math.max(2, X(ce) - X(cs)), H);
  }
  const cuts = cutsOf(tk);
  for (let x = 0; x < W; x++) {
    const p = tk.peaks[Math.floor((x / W) * n)];
    const tm = (x / W) * tk.dur;
    const gone = cuts.some(([cs, ce]) => tm >= cs && tm <= ce);
    g.fillStyle = p >= 0.989 ? "#ef4444" : gone ? "#5a3a3a" : tm >= a && tm <= b ? "rgba(0,194,162,.85)" : "#34404b";
    const h = Math.max(1, Math.sqrt(p) * (H - 4));
    g.fillRect(x, (H - h) / 2, 1, h);
  }
}

function updateButtons() {
  if (!S.data || !S.lines.length) return;
  const kind = S.play?.kind;
  $("#b-take").classList.toggle("on", kind === "take");
  $("#b-film").classList.toggle("on", kind === "film");
  $("#b-guide").classList.toggle("on", kind === "guide");
  $("#b-export").classList.toggle("on", kind === "raw");
  const sh = cur();
  $("#b-film").disabled = !hasFilm(sh);
  renderTools();
}

function refresh(id) {
  const sh = byId(id);
  if (!sh) return;
  navBadge(sh);
  shotStatus(sh);
  if (sh === cur()) {
    renderTakes();
    renderInfo();
    renderCurText();
    updateButtons();
  }
  progress();
}

function go(i, instant = false) {
  if (S.rec || !S.lines.length || G.editing) return;
  stopPlay();
  S.cur = clamp(i, 0, S.lines.length - 1);
  LS.set(curKey(), S.cur);
  const sh = cur();
  document.querySelectorAll(".ni.cur, .shot.cur").forEach((e) => e.classList.remove("cur"));
  const ni = document.getElementById("n-" + sh.id);
  ni.classList.add("cur");
  ni.scrollIntoView({ block: "nearest" });
  document.getElementById("s-" + sh.id).classList.add("cur");
  centerShot(instant);
  renderCurText();
  renderTakes();
  renderInfo();
  updateButtons();
  setStrip(bandWords(sh));
  if (hasFilm(sh)) {
    film.pause();
    film.muted = true;
    film.currentTime = sh.film.vo + 0.4;
  }
  if (!sh.guide && sh.gdur) poll(sh.id, true);
  if (sh.takes.some((x) => !x.tmp && x.status === "ok" && !x.pauses)) api(`/api/line/${encodeURIComponent(sh.id)}?pauses=1`).then(replaceShot).catch(() => {});
}

function centerShot(instant) {
  if (S.mode !== "texte" || !S.lines.length) return;
  const box = $("#script");
  const d = document.getElementById("s-" + cur().id);
  box.scrollTo({ top: d.offsetTop - box.clientHeight * 0.3, behavior: instant ? "instant" : "smooth" });
}

function setMode(m) {
  S.mode = m;
  LS.set("mode", m);
  document.body.classList.toggle("mode-texte", m === "texte");
  document.body.classList.toggle("mode-rythmo", m === "rythmo");
  document.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  if (S.data && S.lines.length) {
    clearKaraoke();
    if (m === "texte") requestAnimationFrame(() => centerShot(true));
    else if (!S.rec && !S.play) setStrip(bandWords(cur()));
  }
}

function setFilm(on) {
  S.film = on && !!S.data?.film;
  LS.set("film", on);
  $("#filmon").checked = S.film;
  document.body.classList.toggle("nofilm", !S.film);
}

// ------------------------------------------------------------------ studio commands
document.addEventListener("mousedown", (e) => {
  if (e.target.closest("#view-studio button")) e.preventDefault(); // no focus: Space stays on recording
});
$("#gatebtn").onclick = enableMic;
$("#recbtn").onclick = () => (S.rec ? stopRec(true) : startRec());
$("#b-redo").onclick = () => (S.rec ? stopRec(false, true) : discardTake(null, true));
$("#b-take").onclick = () => (S.play?.kind === "take" ? stopPlay() : playTake());
$("#b-film").onclick = () => (S.play?.kind === "film" ? stopPlay() : playTake(null, true));
$("#b-guide").onclick = () => (S.play?.kind === "guide" ? stopPlay() : playRythmo());
$("#b-export").onclick = () => (S.play?.kind === "raw" ? stopPlay() : playRaw());
$("#b-gen").onclick = genSynth;
$("#t-src").onchange = (e) => {
  e.target.blur();
  LS.set(srcKey(), e.target.value);
  stopPlay();
  setStrip(bandWords(cur()));
  renderTools();
  renderInfo();
};
$("#t-voice").onchange = (e) => {
  e.target.blur();
  LS.set("tvoice:" + S.data.project.dir, e.target.value);
};
$("#t-shorter").onclick = () => setTempo(tempoOf(selTake(cur())) * 1.02);
$("#t-longer").onclick = () => setTempo(tempoOf(selTake(cur())) / 1.02);
$("#t-reset").onclick = () => setTempo(1);
$("#t-pslow").onclick = () => setPace(cur().id, linePace(cur()).wpm - 5);
$("#t-pfast").onclick = () => setPace(cur().id, linePace(cur()).wpm + 5);
$("#t-preset").onclick = () => setPace(cur().id, null);
$("#t-pall").onclick = async () => {
  const w = linePace(cur()).wpm;
  await post("/api/pace", { id: null, wpm: w });
  await setPace(cur().id, null);
  toast(t("tl.pace.alldone", { w: Math.round(w) }));
};
$("#t-place").onclick = placeHere;
$("#t-pcap").onchange = async (e) => {
  e.target.blur();
  const tk = selTake(cur());
  if (!tk) return;
  await setPauses(tk, { cap: e.target.value ? +e.target.value : null });
  const k = selTake(cur());
  toast(e.target.value ? t("tl.pcap.done", { c: e.target.value, s: cutTotal(k).toFixed(2) }) : t("tl.pcap.off"));
};
$("#t-follow").onclick = placeFollowing;
film.addEventListener("focus", () => film.blur()); // the native controls must not take Space (record) or the arrows
$("#b-prev").onclick = () => go(S.cur - 1);
$("#b-next").onclick = () => go(S.cur + 1);
$("#clip").onclick = () => $("#clip").classList.remove("on");
document.querySelectorAll("#mode button").forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
$("#filmon").onchange = (e) => {
  setFilm(e.target.checked);
  e.target.blur();
};
$("#preroll").onchange = (e) => {
  S.preroll = +e.target.value;
  LS.set("preroll", S.preroll);
  e.target.blur();
};
$("#dev").onchange = async (e) => {
  e.target.blur();
  try {
    await openMic(e.target.value);
    toast(t("st.mic.on", { d: S.devLabel }));
  } catch (err) {
    toast(t("st.mic.err", { e: err.message || err }));
  }
};
$("#noisebtn").onclick = recordNoise;
$("#denoise").onchange = async (e) => {
  e.target.blur();
  const v = +e.target.value;
  S.data.settings = await post("/api/settings", { denoise: v });
  toast(v ? t("st.nr.done", { db: v }) : t("st.nr.off"));
  refreshSoon();
};
$("#chan").onchange = async (e) => {
  e.target.blur();
  const v = e.target.value === "auto" ? "auto" : +e.target.value;
  await post("/api/settings", { channel: v });
  S.data.settings.channel = v;
  toast(v === "auto" ? t("st.chan.autodone") : t("st.chan.done", { n: v + 1 }));
};
film.addEventListener("error", () => {
  if (!S.data || !film.getAttribute("src")) return;
  S.data.film = null;
  setFilm(false);
  $("#filmon").disabled = true;
  toast(t("st.film.err"));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && anyOverlay()) {
    anyOverlay().classList.remove("on");
    return;
  }
  if (G.view !== "studio" || !S.data || anyOverlay()) return;
  if (e.target.matches("select, input")) {
    if (e.key === " " || e.key === "Escape") e.target.blur();
    else return;
  }
  if (e.target.matches("textarea") || G.editing) return;
  if ($("#gate").classList.contains("on")) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      enableMic();
    } else if (e.key === "Escape") $("#gate").classList.remove("on");
    return;
  }
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (S.rec?.noise) {
    if (k === "Escape") stopRec(false);
    e.preventDefault();
    return;
  }
  if (S.rec) {
    if (k === " ") stopRec(true);
    else if (k === "Backspace") stopRec(false, true);
    else if (k === "Escape") stopRec(false);
    e.preventDefault();
    return;
  }
  if (!S.lines.length) return;
  switch (k) {
    case " ": startRec(); break;
    case "Backspace": discardTake(null, true); break;
    case "Delete": discardTake(null, false); break;
    case "Escape": stopPlay(); break;
    case "ArrowRight": case "ArrowDown": case "PageDown": go(S.cur + 1); break;
    case "ArrowLeft": case "ArrowUp": case "PageUp": go(S.cur - 1); break;
    case "Enter": S.play?.kind === "take" ? stopPlay() : playTake(); break;
    case "f": case "F": S.play?.kind === "film" ? stopPlay() : playTake(null, true); break;
    case "g": case "G": S.play?.kind === "guide" ? stopPlay() : playRythmo(); break;
    case "s": case "S": genSynth(); break;
    case "i": case "I": placeHere(); break;
    case "e": case "E": editLine(); break;
    case "t": case "T": S.play?.kind === "raw" ? stopPlay() : playRaw(); break;
    case "m": case "M": setMode(S.mode === "texte" ? "rythmo" : "texte"); break;
    case "v": case "V": setFilm(!S.film); break;
    case "+": case "=": S.pxs = clamp(S.pxs * 1.15, 200, 900); LS.set("pxs", S.pxs); if (!S.play) setStrip(bandWords(cur())); break;
    case "-": S.pxs = clamp(S.pxs / 1.15, 200, 900); LS.set("pxs", S.pxs); if (!S.play) setStrip(bandWords(cur())); break;
    case "?": $("#help").classList.toggle("on"); break;
    default:
      if (/^[1-9]$/.test(k)) selectTake(+k);
      else return;
  }
  e.preventDefault();
});

setTimeout(boot, 0);
