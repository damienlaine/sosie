# Recording the samples of a voice

The clone imitates one recording, its **reference**: about 30 seconds of the voice. Everything you hear in the clone comes from it: timbre, accent, pace, energy. Sosie guides its recording (Voices ▸ New voice), but the rules are worth knowing.

## Before recording

1. **Language.** Record in the language the voice will speak. The accent comes from the reference: a French reference makes English with a French accent. One voice per language (e.g. `me-fr`, `me-en`).
2. **Room.** Quiet, soft furnishings, no echo. Turn off what hums if you can; what remains is handled by the noise profile.
3. **Microphone.** 15–20 cm from the mouth, slightly off-axis, a pop filter if you have one. Phantom power for a condenser microphone. No processing anywhere in the chain (no compressor, EQ, noise suppression, automatic gain): Sosie captures raw audio and does the cleaning itself.
4. **Noise profile.** Click *Noise profile* and stay silent for 10 seconds. Redo it if the room changes (a fan, a window).
5. **Level.** Peaks between −18 and −6 dBFS: the light zone of the meter. Never clipping (the CLIP badge turns red).

## Reading

6. **Read the way the voice should sound.** The clone copies the delivery: a calm, posed reading gives a calm voice; an energetic one gives an energetic voice. Speak at the pace you want to hear.
7. **The first sentence matters most.** The text model only listens to the first 6 seconds of the reference; the decoder listens to all 30 (the timbre). Make the first sentence long, natural and representative.
8. **One good take per sentence.** Redo (⌫) until you like it; the kept take is the starred one. About ten sentences give 30 seconds once trimmed.

## Building and checking

9. **Build the voice.** The kept takes are joined in script order, each denoised against the profile, trimmed to its speech, separated by 0.35 s, high-passed at 70 Hz, resampled to 24 kHz and levelled to −20 LUFS. The previous reference is kept as `ref-<date>.wav`.
10. **Listen, compared.** In *Synthesis*, generate a sentence you also recorded, and listen to both one after the other. Judge by ear: a transcription check finds missing words, not a wrong timbre.

## Other sources

- **Import a recording**: 30 s of clean speech by a single voice, any format ffmpeg reads (cut at 30 s).
- **From a project**: the kept takes of the open project (in the order of its *To record* list if it has one): real voice-over takes, glued together, make an excellent reference.

## Settings of a voice

| setting | default | effect |
|---|---|---|
| exaggeration | 0.35 | emphasis and energy; higher is more theatrical, and faster |
| cfg_weight | 0.3 | lower is slower and calmer; higher is faster and closer to the reference |
| temperature | 0.6 | variety between draws; too high and the voice slips |
| decoder_seconds | 30 | seconds of reference given to the decoder (timbre) |
| tempo | 1.0 | speed change after generation, pitch unchanged (WSOLA); 1.15 if the clone is slower than you |
| watermark | on | inaudible Perth watermark in generated files |
