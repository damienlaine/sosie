# Live voice conversion: feasibility

Goal: speak into the microphone and hear (or send to a call) the cloned voice, with as little delay as possible.

## The model

Chatterbox's voice conversion is the second half of its text-to-speech: the S3 tokenizer turns any speech into 25 speech tokens per second (content, not timbre), then the S3Gen decoder (flow matching, then the HiFT vocoder) renders those tokens in the reference voice. No training per voice: the same reference as the synthesis.

## Measurements (RTX 4090 Laptop, 2-second windows)

| reference | flow steps | flow | vocoder | per window |
|---|---|---|---|---|
| 6 s | 10 | 337 ms | 15 ms | ~350 ms |
| 6 s | 5 | 179 ms | 15 ms | ~195 ms |
| 6 s | 2 | 76 ms | 15 ms | ~90 ms |
| 10 s | 10 | 505 ms | 15 ms | ~520 ms |
| 10 s | 5 | 264 ms | 16 ms | ~280 ms |
| 30 s | 10 | — | — | 1.5–2.3 s |

The tokenizer costs 6 ms. The cost is the flow decoder, which processes the reference and the window together: it grows with the reference length and the number of steps.

## Streaming by sliding windows

Every *hop* (0.4 s), the last 2 seconds of microphone input are converted; only the new part is played, minus the last 0.12 s (3 tokens), which still depend on what comes next and are redone by the next window; consecutive parts are joined with a 40 ms crossfade. (Chatterbox's own `finalize=False` path fails on a mask size mismatch; dropping the tail by hand does the same.)

Simulated on a 14 s sentence:

| reference, steps | compute per 0.4 s hop | real time? | delay |
|---|---|---|---|
| 6 s, 5 steps | 205 ms (max 256) | yes | ≈ 0.4 + 0.2 + 0.12 ≈ 0.7 s |
| 10 s, 5 steps | 274 ms (max 291) | yes | ≈ 0.8 s |
| 10 s, 10 steps | 518 ms | no (hop 0.6 s needed) | ≈ 1.2 s |

## Plan

1. Judge the quality by ear on the simulation (offline conversion vs. streamed, 6 and 10 s references) before building anything.
2. A *Live* tab: microphone → worklet → WebSocket → the server's GPU loop → back to the page (monitoring), with the delay shown.
3. A virtual microphone on Linux (PipeWire null sink) so a video call can use the converted voice.
4. Speed-ups if needed: half precision, CUDA graphs, fewer steps.
