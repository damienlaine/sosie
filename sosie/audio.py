"""Audio plumbing with numpy and ffmpeg only (the recording studio does not need torch):
WAV in/out, spectral-subtraction denoiser, speech detection, loudness, WSOLA tempo."""
import os
import re
import subprocess
import wave

import numpy as np

CLIP = 0.989


def wav_info(path):
    """Header of a WAV file: {"fmt": 1 PCM / 3 float, "channels", "sr", "bits", "offset", "size"} (data chunk position)."""
    import struct
    with open(path, "rb") as f:
        if f.read(12)[8:12] != b"WAVE":
            raise ValueError(f"not a WAV file: {path}")
        info = {}
        while True:
            h = f.read(8)
            if len(h) < 8:
                break
            cid, size = h[:4], struct.unpack("<I", h[4:])[0]
            if cid == b"fmt ":
                d = f.read(size)
                fmt, ch, sr, _, _, bits = struct.unpack("<HHIIHH", d[:16])
                if fmt == 0xFFFE and len(d) >= 26:          # WAVE_FORMAT_EXTENSIBLE: the sub-format says PCM or float
                    fmt = struct.unpack("<H", d[24:26])[0]
                info.update(fmt=fmt, channels=ch, sr=sr, bits=bits)
                if size % 2:
                    f.read(1)
            elif cid == b"data":
                info.update(offset=f.tell(), size=size)
                break
            else:
                f.seek(size + size % 2, 1)
    if "fmt" not in info or "offset" not in info:
        raise ValueError(f"incomplete WAV file: {path}")
    return info


def read_wav(path):
    """(float32 samples [n, channels], sample rate) for 16/24/32-bit PCM and 32/64-bit float WAV."""
    i = wav_info(path)
    ch, bw = i["channels"], i["bits"] // 8
    with open(path, "rb") as f:
        f.seek(i["offset"])
        raw = f.read(i["size"])
    raw = raw[: len(raw) // (ch * bw) * ch * bw]
    if i["fmt"] == 3:
        x = np.frombuffer(raw, "<f4" if bw == 4 else "<f8").astype(np.float32)
    elif bw == 2:
        x = np.frombuffer(raw, "<i2").astype(np.float32) / 32768
    elif bw == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = (np.where(v >= 1 << 23, v - (1 << 24), v) / float(1 << 23)).astype(np.float32)
    elif bw == 4:
        x = (np.frombuffer(raw, "<i4") / 2.0 ** 31).astype(np.float32)
    else:
        raise ValueError(f"{i['bits']}-bit WAV")
    return x.reshape(-1, ch), i["sr"]


def ffmpeg_probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels",
                        "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    sr, ch = r.stdout.strip().split(",")[:2]
    return {"sr": int(sr), "channels": int(ch)}


def load_any(path, sr=None, mono=True):
    """Any audio file ffmpeg can read, as float32 [n] (mono) at sr (default: the file's rate)."""
    info = ffmpeg_probe(path)
    sr = sr or info["sr"]
    args = ["ffmpeg", "-v", "error", "-i", path, "-ar", str(sr)] + (["-ac", "1"] if mono else []) + ["-f", "f32le", "-"]
    r = subprocess.run(args, capture_output=True, check=True)
    x = np.frombuffer(r.stdout, "<f4").copy()
    return (x if mono else x.reshape(-1, info["channels"])), sr


def write_wav24(path, x, sr):
    x = x if x.ndim == 2 else x[:, None]
    v = np.round(np.clip(x, -1, 1 - 2.0 ** -23) * (1 << 23)).astype("<i4")
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(3)
        w.setframerate(sr)
        w.writeframes(v.view(np.uint8).reshape(-1, 4)[:, :3].tobytes())


def write_wav16(path, x, sr):
    x = x if x.ndim == 2 else x[:, None]
    v = np.round(np.clip(x, -1, 1 - 2.0 ** -15) * 32768).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(v.tobytes())


def wav_duration(path):
    i = wav_info(path)
    return i["size"] / (i["channels"] * i["bits"] // 8) / i["sr"]


def is_wav(body):
    return body[:4] == b"RIFF" and body[8:12] == b"WAVE"


def pick_channel(x, setting="auto"):
    """The microphone input: the one chosen in the settings, else the loudest."""
    if setting == "auto" or not isinstance(setting, int) or setting >= x.shape[1]:
        return int(np.argmax(np.sqrt((x.astype(np.float64) ** 2).mean(axis=0))))
    return setting


def dual_mono(path, setting="auto"):
    """Rewrites a take as fake stereo: the microphone channel on both sides (the other input of the sound card is dropped)."""
    x, sr = read_wav(path)
    ch = pick_channel(x, setting)
    if x.shape[1] == 2 and np.array_equal(x[:, 0], x[:, 1]):
        return ch
    write_wav24(path, np.repeat(x[:, ch:ch + 1], 2, axis=1), sr)
    return ch


# ------------------------------------------------------------------ denoiser
def stft(y, n=2048, hop=512):
    w = np.hanning(n + 1)[:-1]
    z = np.concatenate([np.zeros(n), y, np.zeros(n)])
    return np.fft.rfft(np.lib.stride_tricks.sliding_window_view(z, n)[::hop] * w, axis=1), w


def istft(X, w, length, hop=512):
    n = len(w)
    fr = np.fft.irfft(X, n, axis=1) * w
    out, norm = np.zeros(hop * (len(fr) - 1) + n), np.zeros(hop * (len(fr) - 1) + n)
    for i, f in enumerate(fr):
        out[i * hop:i * hop + n] += f
        norm[i * hop:i * hop + n] += w * w
    return (out / np.maximum(norm, 1e-8))[n:n + length]


_NOISE = {}


def noise_psd(path, sr):
    """Mean spectrum of the background noise recorded in path (a few seconds of open-mic silence), or None."""
    if not path or not os.path.exists(path):
        return None
    key = (path, os.path.getmtime(path), sr)
    if key not in _NOISE:
        x, nsr = read_wav(path)
        if nsr != sr:
            return None
        y = x[int(0.3 * sr):, int(np.argmax((x.astype(np.float64) ** 2).mean(axis=0)))].astype(np.float64)
        X, _ = stft(y)
        _NOISE.clear()
        _NOISE[key] = (np.abs(X[2:-2]) ** 2).mean(axis=0)
    return _NOISE[key]


def denoise(y, sr, noise_path, calm=None, depth=14):
    """Spectral subtraction of the background noise (fan, room): the noise profile is re-levelled on the silence before the
    first syllable (calm = (start, end) in s; failing that, the quietest frames of the take), power smoothed in time and
    frequency, gain released in ~80 ms, reduction capped at depth dB (beyond 14 the voice starts to sound "under water").
    Returns (signal, profile offset in dB), or (y, None) without a profile."""
    pn = noise_psd(noise_path, sr)
    if pn is None:
        return y, None
    X, w = stft(y.astype(np.float64))
    P = np.abs(X) ** 2
    f = np.fft.rfftfreq(len(w), 1 / sr)
    band = (f > 150) & (f < 8000)
    e = P[:, band].sum(axis=1)
    t = (np.arange(len(P)) * 512 - len(w) / 2) / sr
    sel = (t > calm[0]) & (t < calm[1]) if calm else np.zeros(len(P), bool)
    if sel.sum() < 0.5 * sr / 512:
        sel = e <= np.percentile(e, 25)
    floor = np.percentile(P[sel], 25, axis=0) / -np.log(0.75)   # lower quartile: a breath or a rustle does not skew it
    k = float(np.clip(np.median(floor[band] / (pn[band] + 1e-20)), 10 ** -1.2, 10 ** 1.2))
    Q = np.pad(P, 1, mode="edge")
    Ps = sum(Q[1 + i:len(Q) - 1 + i, 1 + j:Q.shape[1] - 1 + j] for i in (-1, 0, 1) for j in (-1, 0, 1)) / 9
    gmin = 10 ** (-depth / 20)
    G = np.maximum(np.sqrt(np.clip(1 - max(2.0, depth / 8) * k * pn / (Ps + 1e-20), 0, 1)), gmin)
    rel = gmin ** (512 / (0.08 * sr))
    for i in range(1, len(G)):
        G[i] = np.maximum(G[i], G[i - 1] * rel)
    return istft(X * G, w, len(y)), round(10 * np.log10(k), 1)


# ------------------------------------------------------------------ analysis
def to16k(y, sr):
    if sr == 16000:
        return y.astype(np.float32)
    fc = 7600 / sr
    n = np.arange(-64, 65)
    h = 2 * fc * np.sinc(2 * fc * n) * np.hamming(len(n))
    z = np.convolve(y, h / h.sum(), "same")
    if sr == 48000:
        return z[::3].astype(np.float32)
    t = np.arange(0, len(y) / sr, 1 / 16000) * sr
    return np.interp(t, np.arange(len(z)), z).astype(np.float32)


def voiced(y, sr):
    """30 ms frames (10 ms hop) above the background noise, without clicks (under 80 ms): (times, voiced)."""
    hop, fr = sr // 100, 3 * (sr // 100)
    c = np.concatenate([[0.0], np.cumsum(y.astype(np.float64) ** 2)])
    idx = np.arange(0, len(y) - fr, hop)
    db = 10 * np.log10((c[idx + fr] - c[idx]) / fr + 1e-12)
    v = db > max(np.percentile(db, 10) + 12, db.max() - 40, -70)
    d = np.diff(np.concatenate([[0], v.astype(np.int8), [0]]))
    for s, e in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)):
        if e - s < 8:
            v[s:e] = False
    return idx / sr, v


def speech_bounds(y, sr, asr, head=0.10, tail=0.30):
    """Start and end of speech: energy above the noise floor, inside the window of the recognised words."""
    fr = 3 * (sr // 100)
    dur = len(y) / sr
    if len(y) < 4 * fr:
        return [0.0, round(dur, 3)]
    t, v = voiced(y, sr)
    if asr:
        v &= (t >= asr[0][1] - 0.6) & (t <= asr[-1][2] + 0.8)
    if v.any():
        a, b = t[v][0] - head, t[v][-1] + fr / sr + tail
    elif asr:
        a, b = asr[0][1] - head, asr[-1][2] + tail
    else:
        a, b = 0.0, dur
    return [round(max(0.0, a), 3), round(min(dur, b), 3)]


def find_pauses(y, sr, a, b, min_len=0.15):
    """Silences inside the speech of a take, between a and b (s): [[start, end], …] where the level drops to the noise floor
    for at least min_len seconds (breaths and clicks under 80 ms do not break a pause)."""
    t, v = voiced(y, sr)
    if not len(t):
        return []
    fr = 0.03
    on = np.flatnonzero(v & (t >= a) & (t + fr <= b))
    if len(on) < 2:
        return []
    out = []
    for i, j in zip(on[:-1], on[1:]):
        if j - i > 1:
            s, e = t[i] + fr, t[j]
            if e - s >= min_len:
                out.append([round(float(s), 3), round(float(e), 3)])
    return out


def quiet_point(y, sr, t, win=0.06):
    """The quietest 10 ms around t (± win seconds): where to cut speech without clicking into a syllable."""
    hop = int(0.01 * sr)
    i0, i1 = max(0, int((t - win) * sr)), min(len(y) - hop, int((t + win) * sr))
    if i1 <= i0:
        return t
    starts = np.arange(i0, i1, max(1, hop // 2))
    e = [float(np.mean(y[k:k + hop] ** 2)) for k in starts]
    return (starts[int(np.argmin(e))] + hop / 2) / sr


def speech_rms(y, sr):
    """RMS level of the voiced frames (the level of the speech, not of the silences)."""
    t, v = voiced(y, sr)
    fr = 3 * (sr // 100)
    if not v.any():
        return float(np.sqrt(np.mean(y ** 2)) + 1e-9)
    idx = (t[v] * sr).astype(int)
    return float(np.sqrt(np.mean(np.concatenate([y[i:i + fr] for i in idx]) ** 2)) + 1e-9)


def splice(y, sr, s, e, insert=None, xf=0.015, win=0.03):
    """y with [s, e] (s) replaced by insert (or removed), cut points moved to the quietest instants nearby,
    each join crossfaded over xf seconds; the insert is brought to the speech level of y. Returns (signal, s, e, insert length)."""
    s, e = quiet_point(y, sr, s, win), quiet_point(y, sr, e, win)    # a small window: a hiss ("s") is quieter than a vowel
    a, b = int(s * sr), int(e * sr)
    pieces = [y[:a]]
    n_ins = 0
    if insert is not None and len(insert):
        g = speech_rms(y, sr) / speech_rms(insert, sr)
        ins = insert * min(4.0, max(0.25, g))
        pieces.append(ins)
        n_ins = len(ins)
    pieces.append(y[b:])
    n = int(xf * sr)
    out = pieces[0].astype(np.float64)
    for p in pieces[1:]:
        p = p.astype(np.float64)
        k = min(n, len(out), len(p))
        if k:
            r = np.linspace(0, 1, k)
            out[-k:] = out[-k:] * (1 - r) + p[:k] * r
        out = np.concatenate([out, p[k:]])
    return out, s, e, n_ins / sr


def cut(y, sr, cuts, xf=0.01):
    """y without the regions cuts [[start, end], …] (s), each join crossfaded over xf seconds."""
    if not cuts:
        return y
    n = int(xf * sr)
    parts, pos = [], 0
    for cs, ce in sorted(cuts):
        i, j = int(cs * sr), int(ce * sr)
        if j <= i or i < pos:
            continue
        parts.append(y[pos:i])
        pos = j
    parts.append(y[pos:])
    out = parts[0].astype(np.float64)
    for p in parts[1:]:
        p = p.astype(np.float64)
        k = min(n, len(out), len(p))
        if k:
            r = np.linspace(0, 1, k)
            out[-k:] = out[-k:] * (1 - r) + p[:k] * r
        out = np.concatenate([out, p[k:]])
    return out


def peaks(y, n=400):
    k = max(1, len(y) // n)
    pk = np.abs(y[: len(y) // k * k]).reshape(-1, k).max(axis=1) if len(y) >= k else np.abs(y)
    return [round(float(p), 3) for p in pk]


def ffmpeg(*args):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-800:])
    return r.stderr


def loudness(path):
    """(integrated loudness in LUFS, sample peak in dBFS)"""
    err = ffmpeg("-i", path, "-af", "ebur128=peak=sample", "-f", "null", "-")
    i = re.findall(r"I:\s+(-?[\d.]+|-inf) LUFS", err)[-1]
    p = re.findall(r"Peak:\s+(-?[\d.]+|-inf) dBFS", err)[-1]
    return float(i), float(p)


def lufs(y, sr):
    """Integrated loudness of a float signal (via ffmpeg, so the studio needs no extra library)."""
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        write_wav24(f.name, np.clip(np.asarray(y, np.float64), -1, 1), sr)
        return loudness(f.name)[0]


def normalize(y, sr, target=-20.0, peak_db=-1.5):
    """Gain to target LUFS, then down if needed so the sample peak stays under peak_db."""
    y = np.asarray(y, np.float64)
    if len(y) > sr * 0.4:
        i = lufs(y / max(1.0, np.abs(y).max()), sr) + 20 * np.log10(max(1.0, np.abs(y).max()))
        if i > -70:
            y = y * 10 ** ((target - i) / 20)
    pk = np.abs(y).max() if len(y) else 0
    if pk > 10 ** (peak_db / 20):
        y = y * 10 ** (peak_db / 20) / pk
    return y


def atempo(src, dst, factor, sr=48000):
    """Speeds a voice up or down without changing its pitch. WSOLA (ffmpeg atempo) on purpose: phase-vocoder methods
    (Rubber Band R2/R3) make a cloned voice sound metallic, WSOLA sounds like the raw voice."""
    ffmpeg("-i", src, "-af", f"atempo={factor}", "-ar", str(sr), "-ac", "1", "-c:a", "pcm_s16le", dst)
