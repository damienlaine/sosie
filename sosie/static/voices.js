"use strict";
// The voice library: references, capture protocol, settings.

async function renderVoices() {
  const app = await refreshApp();
  const grid = $("#vgrid");
  grid.innerHTML = "";
  if (!app.voices.length) grid.append(el("div", "card muted", t("vo.empty")));
  app.voices.forEach((v) => grid.append(voiceCard(v)));
}

function voiceCard(v) {
  const c = el("div", "card vcard");
  const st = v.settings;
  const rf = v.refFrom || {};
  const from = rf.kind === "file" ? t("vo.from.file", { f: rf.file }) : rf.kind === "samples" ? t("vo.from.samples", { n: (rf.takes || []).length })
    : rf.kind === "takes" ? t("vo.from.takes", { ids: (rf.takes || []).join(", "), p: rf.project ? ` (${rf.project})` : "" }) : "";
  c.innerHTML = `<div class="vh"><b>${esc(v.name)}</b><span class="lang">${esc(v.lang)}</span><span class="spacer"></span><span class="muted" style="font-size:11px">${esc(v.id)}</span></div>
    <div class="meta">${v.ref ? t("vo.ref", { s: v.refDur, d: v.refDate || "" }) + (from ? " · " + esc(from) : "") : `<span class="warn">${t("vo.noref")}</span>`}<br/>
    ${t("vo.sets", { e: st.exaggeration, c: st.cfg_weight, t: st.temperature, d: st.decoder_seconds, tp: st.tempo })}${v.watermark ? "" : " · " + t("vo.nowm")}
    ${v.prompts ? "<br/>" + t("vo.samples", { n: v.takes, of: v.prompts }) : ""}${v.notes ? `<br/><i>${esc(v.notes)}</i>` : ""}</div>
    ${v.ref ? `<audio controls preload="none" src="/voices/${encodeURIComponent(v.id)}/ref.wav?v=${encodeURIComponent(v.refDate || "")}"></audio>` : ""}
    <div class="btns"></div>
    <div class="vedit" style="display:none"></div>`;
  const btns = c.querySelector(".btns");
  const bt = (label, fn, cls) => {
    const b = el("button", cls || null, label);
    b.onclick = fn;
    btns.append(b);
    return b;
  };
  if (v.ref) bt(t("vo.try"), () => { LS.set("synth.voice", v.id); setView("synth"); }, "primary");
  if (v.prompts) bt(t("vo.record"), () => recordVoice(v.id));
  if (v.takes) bt(t("vo.build"), async (e) => {
    e.target.disabled = true;
    try {
      await post(`/api/voices/${encodeURIComponent(v.id)}/build`);
      toast(t("pr.built"));
      renderVoices();
    } catch (err) {
      toast(t("err", { e: err.message }));
      e.target.disabled = false;
    }
  });
  bt(t("vo.import"), () => importRef(v.id));
  if (S.data && S.data.project.kind !== "voice" && S.lines.some((l) => selTake(l)?.status === "ok")) bt(t("vo.fromproj"), () => fromProject(v.id));
  bt(t("vo.edit"), () => toggleEdit(c, v));
  bt("🗑", async () => {
    if (!confirmTwice(c, t("vo.delete.confirm"))) return;
    await post(`/api/voices/${encodeURIComponent(v.id)}/delete`);
    toast(t("vo.deleted"));
    renderVoices();
  }, "danger");
  return c;
}

// a second click within 4 s confirms (no browser dialog)
function confirmTwice(box, msg) {
  if (box.dataset.armed && Date.now() - +box.dataset.armed < 4000) {
    delete box.dataset.armed;
    return true;
  }
  box.dataset.armed = Date.now();
  toast(msg);
  return false;
}

const SETS = [
  ["exaggeration", 0.1, 1.2, 0.05], ["cfg_weight", 0.0, 1.0, 0.05], ["temperature", 0.2, 1.2, 0.05],
  ["decoder_seconds", 6, 30, 1], ["tempo", 0.8, 1.3, 0.01],
];

function setsHTML(prefix, st) {
  return SETS.map(([k, a, b, s]) => `<label title="${esc(t("set." + k + ".t"))}">${t("set." + k)}</label><input type="range" id="${prefix}-${k}" min="${a}" max="${b}" step="${s}" value="${st[k]}"/><output id="${prefix}-${k}-o">${st[k]}</output>`).join("");
}
function bindSets(prefix) {
  SETS.forEach(([k]) => {
    const i = $(`#${prefix}-${k}`);
    i.oninput = () => ($(`#${prefix}-${k}-o`).textContent = i.value);
  });
}
const readSets = (prefix) => Object.fromEntries(SETS.map(([k]) => [k, +$(`#${prefix}-${k}`).value]));

function toggleEdit(c, v) {
  const box = c.querySelector(".vedit");
  if (box.style.display !== "none") return (box.style.display = "none");
  box.style.display = "block";
  const p = "ve-" + v.id.replace(/\W/g, "_");
  box.innerHTML = `<div class="form" style="grid-template-columns:110px 1fr"><label>${t("nv.name")}</label><input type="text" id="${p}-name" value="${esc(v.name)}"/>
    <label>${t("vo.notes")}</label><input type="text" id="${p}-notes" value="${esc(v.notes)}"/>
    <label>${t("vo.wm")}</label><label class="opt" title="${esc(t("vo.wm.t"))}"><input type="checkbox" id="${p}-wm" ${v.watermark ? "checked" : ""}/> ${t("vo.wm.on")}</label></div>
    <div class="sets" style="margin-top:8px">${setsHTML(p, v.settings)}</div>
    <div class="row" style="margin-top:8px;display:flex;gap:6px"><button class="primary" id="${p}-save">${t("vo.save")}</button><button id="${p}-def">${t("vo.defaults")}</button></div>`;
  bindSets(p);
  $(`#${p}-def`).onclick = () => {
    const d = { exaggeration: 0.35, cfg_weight: 0.3, temperature: 0.6, decoder_seconds: 30, tempo: 1.0 };
    SETS.forEach(([k]) => {
      $(`#${p}-${k}`).value = d[k];
      $(`#${p}-${k}-o`).textContent = d[k];
    });
  };
  $(`#${p}-save`).onclick = async () => {
    await post(`/api/voices/${encodeURIComponent(v.id)}`, { name: $(`#${p}-name`).value, notes: $(`#${p}-notes`).value, watermark: $(`#${p}-wm`).checked, ...readSets(p) });
    toast(t("vo.saved"));
    renderVoices();
  };
}

async function recordVoice(vid) {
  G.app = await post(`/api/voices/${encodeURIComponent(vid)}/record`);
  projectButton();
  await loadProject();
  setView("studio");
}

function importRef(vid) {
  const fp = $("#filepick");
  fp.value = "";
  fp.onchange = async () => {
    const f = fp.files[0];
    if (!f) return;
    try {
      toast(t("vo.importing"));
      await post(`/api/voices/${encodeURIComponent(vid)}/import`, f, { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(f.name) });
      toast(t("vo.imported"));
      renderVoices();
    } catch (e) {
      toast(t("err", { e: e.message }));
    }
  };
  fp.click();
}

async function fromProject(vid) {
  const ids = (S.data.todo || []).filter((id) => selTake(byId(id) || { takes: [] }));
  try {
    await post(`/api/voices/${encodeURIComponent(vid)}/from-project`, { ids: ids.length ? ids : null });
    toast(t("vo.fromproj.done", { p: S.data.project.name }));
    renderVoices();
  } catch (e) {
    toast(t("err", { e: e.message }));
  }
}

// new voice
$("#v-new").onclick = () => {
  fillLangSelect($("#nv-lang"), I18N.lang === "fr" ? "fr" : "en");
  $("#nv-name").value = "";
  $("#nv-err").textContent = "";
  fillPrompts();
  $("#newvoice").classList.add("on");
  $("#nv-name").focus();
};
function fillPrompts() {
  const p = G.app.prompts[$("#nv-lang").value];
  $("#nv-prompts").value = p ? p.join("\n") : "";
  $("#nv-prompts").placeholder = p ? "" : t("nv.prompts.ph");
}
$("#nv-lang").onchange = fillPrompts;
$("#nv-create").onclick = async () => {
  $("#nv-err").textContent = "";
  try {
    const r = await post("/api/voices", { name: $("#nv-name").value.trim() || "Voice", lang: $("#nv-lang").value, prompts: $("#nv-prompts").value });
    $("#newvoice").classList.remove("on");
    await recordVoice(r.id);
    toast(t("nv.created"), 4000);
  } catch (e) {
    $("#nv-err").textContent = e.message;
  }
};

onView((v, relang) => {
  if (v === "voices") renderVoices();
});
