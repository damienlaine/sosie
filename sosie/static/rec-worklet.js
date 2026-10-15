// Microphone capture: peaks for the level meter (~30 per second), and raw samples while recording.
class Rec extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.buf = [];
    this.len = 0;
    this.pk = [0, 0];
    this.n = 0;
    this.port.onmessage = (e) => {
      if (e.data === "start") {
        this.buf = [];
        this.len = 0;
        this.on = true;
      } else if (e.data === "stop") {
        this.flush();
        this.on = false;
        this.port.postMessage({ type: "stopped" });
      }
    };
  }

  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const C = Math.min(2, inp.length);
    for (let c = 0; c < C; c++) {
      const d = inp[c];
      let m = this.pk[c];
      for (let i = 0; i < d.length; i++) {
        const v = d[i] < 0 ? -d[i] : d[i];
        if (v > m) m = v;
      }
      this.pk[c] = m;
    }
    if (++this.n >= 12) {
      this.port.postMessage({ type: "meter", pk: this.pk.slice(0, C) });
      this.pk = [0, 0];
      this.n = 0;
    }
    if (this.on) {
      const frame = [];
      for (let c = 0; c < C; c++) frame.push(inp[c].slice());
      this.buf.push(frame);
      this.len += inp[0].length;
      if (this.len >= 9600) this.flush();
    }
    return true;
  }

  flush() {
    if (!this.buf.length) return;
    const C = this.buf[0].length;
    const out = [];
    for (let c = 0; c < C; c++) {
      const a = new Float32Array(this.len);
      let o = 0;
      for (const f of this.buf) {
        a.set(f[c], o);
        o += f[c].length;
      }
      out.push(a);
    }
    this.port.postMessage({ type: "data", ch: out }, out.map((a) => a.buffer));
    this.buf = [];
    this.len = 0;
  }
}

registerProcessor("rec", Rec);
