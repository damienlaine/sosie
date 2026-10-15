"use strict";
// The synthesis panel: a text in a library voice, as a clip to listen to, download or copy.

const Y = { clips: [], playing: null, busy: false, last: null };
const clipAudio = new Audio();

function synthVoices() {
  return (G.app.voices || []).filter((v) => v.ref);
}

async function renderSynth() {
  await refreshApp();
  const vs = synthVoices();
  const sel = $("#s-voice");
  const want = LS.get("synth.voice", sel.value);
  sel.innerHTML = vs.map((v) => `<option value="${esc(v.id)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join("") || `<option value="">${esc(t("sy.novoice"))}</option>`;
  if (vs.some((v) => v.id === want)) sel.value = want;
  fillLangSelect($("#s-lang"), LS.get("synth.lang." + sel.value, vs.find((v) => v.id === sel.value)?.lang || "fr"));
  loadVoiceSets();
  $("#s-text").value ||= LS.get("synth.text", "");
  $("#s-tags").innerHTML = TAGS_DOC.map((x) => `<button data-tag="${x}">[${x}]</button>`).join("");
  $("#s-tags").querySelectorAll("button").forEach((b) => (b.onclick = () => insertAtCursor($("#s-text"), `[${b.dataset.tag}] `)));
  countText();
  await loadClips();
  if (!G.app.engine.available) status(`<span class="warn">${esc(t("sy.notinstalled"))}</span>`);
}
const TAGS_DOC = ["sigh", "laughter", "giggle", "whisper", "clear_throat", "cough", "gasp", "groan", "sniff", "exhale"];

function loadVoiceSets(st) {
  const v = synthVoices().find((x) => x.id === $("#s-voice").value);
  $("#s-sets").innerHTML = setsHTML("ss", st || v?.settings || { exaggeration: 0.35, cfg_weight: 0.3, temperature: 0.6, decoder_seconds: 30, tempo: 1 });
  bindSets("ss");
}

function insertAtCursor(ta, s) {
  const a = ta.selectionStart, b = ta.selectionEnd;
  ta.value = ta.value.slice(0, a) + s + ta.value.slice(b);
  ta.selectionStart = ta.selectionEnd = a + s.length;
  ta.focus();
  countText();
}

function countText() {
  const s = $("#s-text").value.trim();
  const words = s ? s.split(/\s+/).length : 0;
  $("#s-count").textContent = s ? t("sy.count", { w: words, s: Math.max(1, Math.round(words / 2.4)) }) : "";
  LS.set("synth.text", $("#s-text").value);
}

function status(html) {
  $("#s-status").innerHTML = html;
}

async function generate() {
  if (Y.busy) return;
  const text = $("#s-text").value.trim();
  const vid = $("#s-voice").value;
  if (!text || !vid) return toast(t(!vid ? "sy.novoice" : "sy.notext"));
  Y.busy = true;
  $("#s-go").disabled = true;
  status(`<span class="spin"></span> ${esc(t(G.app.engine.loaded ? "sy.queued" : "sy.loading"))}`);
  try {
    const job = await post("/api/synth", {
      text, voice: vid, lang: $("#s-lang").value, settings: readSets("ss"),
      tries: +$("#s-tries").value, check: $("#s-check").checked,
    });
    watchJob(job, {
      onProgress: (j) => {
        if (j.status === "running" && j.progress) status(`<span class="spin"></span> ${esc(t("sy.progress", { s: j.progress.sentence, n: j.progress.sentences, d: j.progress.draw, of: j.progress.draws }))}`);
        else if (j.status === "running") status(`<span class="spin"></span> ${esc(t("sy.loading"))}`);
      },
      onDone: async (clip) => {
        done();
        G.app.engine.loaded = true;
        const why = (clip.report || []).filter((r) => r.bad).map((r) => [
          r.missing?.length ? t("sy.why.missing", { w: r.missing.join(", ") }) : "", r.extra ? t("sy.why.extra", { n: r.extra }) : "",
          r.gap > 1.1 ? t("sy.why.gap", { s: r.gap }) : "", t("sy.why.rate", { r: r.rate })].filter(Boolean).join(", "));
        status(esc(t("sy.done", { s: clip.dur })) + (clip.worst ? ` · <span class="warn" title="${esc(why.join(" | "))}">${esc(t("sy.worst", { n: clip.worst }))} (${esc(why.join(" | "))})</span>` : ""));
        await loadClips(clip.id);
        playClip(clip.id);
      },
      onError: (e) => {
        done();
        status(`<span class="err">${esc(e)}</span>`);
      },
    });
  } catch (e) {
    done();
    status(`<span class="err">${esc(e.message)}</span>`);
  }
  function done() {
    Y.busy = false;
    $("#s-go").disabled = false;
  }
}

async function loadClips(fresh) {
  Y.clips = await api("/api/clips");
  $("#s-clipsdir").textContent = G.app.home + "/clips";
  const box = $("#s-clips");
  box.innerHTML = "";
  if (!Y.clips.length) {
    const e = el("p", "muted", t("sy.noclip"));
    e.style.padding = "14px";
    box.append(e);
  }
  Y.clips.forEach((c) => {
    const d = el("div", "clip" + (c.id === fresh ? " new" : "") + (Y.playing === c.id ? " playing" : ""));
    d.dataset.id = c.id;
    d.draggable = true;      // drag the clip out of the page: Chrome hands the file over (DownloadURL)
    d.ondragstart = (e) => e.dataTransfer.setData("DownloadURL", `audio/wav:${c.id}.wav:${location.origin}/clips/${encodeURIComponent(c.id)}.wav?dl=1`);
    d.title = t("sy.drag");
    d.innerHTML = `<button class="pl">${Y.playing === c.id ? "■" : "▶"}</button><div class="ct" title="${esc(c.text)}">${esc(c.text)}</div>
      <div class="cm">${esc(c.voiceName)} · ${c.dur.toFixed(1)} s · ${esc(c.created.slice(5, 16))}
        <span class="spacer"></span>
        <button data-a="dl" title="${esc(t("sy.dl.t"))}">⬇ WAV</button>
        <button data-a="copy" title="${esc(t("sy.copy.t"))}">${t("sy.copy")}</button>
        <button data-a="reuse" title="${esc(t("sy.reuse.t"))}">↺</button>
        <button data-a="del" title="${esc(t("sy.del.t"))}">🗑</button></div>`;
    d.querySelector(".pl").onclick = () => (Y.playing === c.id ? stopClip() : playClip(c.id));
    d.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => clipAction(c, b.dataset.a, d)));
    box.append(d);
  });
}

function playClip(id) {
  clipAudio.src = `/clips/${encodeURIComponent(id)}.wav`;
  clipAudio.play().catch(() => {});
  Y.playing = id;
  markPlaying();
}
function stopClip() {
  clipAudio.pause();
  Y.playing = null;
  markPlaying();
}
function markPlaying() {
  document.querySelectorAll("#s-clips .clip").forEach((d) => {
    const on = d.dataset.id === Y.playing;
    d.classList.toggle("playing", on);
    d.querySelector(".pl").textContent = on ? "■" : "▶";
  });
}
clipAudio.onended = stopClip;

async function clipAction(c, a, d) {
  if (a === "dl") {
    const link = el("a");
    link.href = `/clips/${encodeURIComponent(c.id)}.wav?dl=1`;
    link.download = c.id + ".wav";
    link.click();
  } else if (a === "copy") {
    try {
      await post(`/api/clips/${encodeURIComponent(c.id)}/copy`);
      toast(t("sy.copied"), 4000);
    } catch (e) {
      try {
        await navigator.clipboard.writeText(G.app.home + "/clips/" + c.id + ".wav");
        toast(t("sy.copied.path"));
      } catch {
        toast(t("err", { e: e.message }));
      }
    }
  } else if (a === "reuse") {
    $("#s-text").value = c.text;
    if (synthVoices().some((v) => v.id === c.voice)) $("#s-voice").value = c.voice;
    $("#s-lang").value = c.lang;
    loadVoiceSets(c.settings);
    countText();
    $("#s-adv").open = true;
  } else if (a === "del") {
    if (!confirmTwice(d, t("sy.del.confirm"))) return;
    if (Y.playing === c.id) stopClip();
    await post(`/api/clips/${encodeURIComponent(c.id)}/delete`);
    loadClips();
  }
}

$("#s-go").onclick = generate;
$("#s-text").addEventListener("input", countText);
$("#s-text").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    generate();
  }
});
$("#s-voice").onchange = () => {
  LS.set("synth.voice", $("#s-voice").value);
  const v = synthVoices().find((x) => x.id === $("#s-voice").value);
  $("#s-lang").value = LS.get("synth.lang." + v?.id, v?.lang || "fr");
  loadVoiceSets();
};
$("#s-lang").onchange = () => LS.set("synth.lang." + $("#s-voice").value, $("#s-lang").value);
$("#s-reset").onclick = () => loadVoiceSets();
$("#s-savevoice").onclick = async () => {
  const vid = $("#s-voice").value;
  if (!vid) return;
  await post(`/api/voices/${encodeURIComponent(vid)}`, readSets("ss"));
  await refreshApp();
  toast(t("vo.saved"));
};

onView((v) => {
  if (v === "synth") renderSynth();
  else stopClip();
});
