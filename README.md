# Sosie

**Your voice double.** Record a voice-over line by line, clone your voice from 30 seconds of speech, and make it say anything, all on your own machine.

Sosie grew out of the production of a product launch film: a voice-over studio built to record a 70-line script against the picture, then a cloned voice to fill the gaps and make the English version. Everything that worked is kept here, with the settings that were judged by ear.

- **Studio**: the script is cut into lines; each line is recorded in as many takes as needed, as full text or on a **rythmo band** (the dubbing band that scrolls with the picture). Whisper tells you what you actually said, word by word. The kept take goes straight to a voice track for the edit: trimmed, denoised against a recorded noise profile, levelled to −20 LUFS, with word timings.
- **Voices**: a library of cloned voices. A guided protocol records the samples (ten sentences to read, a noise profile, levels), and builds the 30-second reference the clone imitates. You can also import a recording, or build a voice from the kept takes of a project.
- **Synthesis**: type a text, pick a voice, get a clip. Each sentence is drawn several times and checked by Whisper; the best draw is kept. Download the WAV, copy it to the clipboard, or drag it out of the page.
- **Projects**: plain folders, saved as you go. Import a script as text or Markdown (one paragraph per line), SRT subtitles (with their timings: dubbing on a video), or JSON.

Interface in English and French. Synthesis and cloning by [Chatterbox Multilingual V3](https://github.com/resemble-ai/chatterbox) (23 languages), speech recognition by [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

## Install

Needs Python 3.10–3.12, `ffmpeg`, and for synthesis an NVIDIA GPU (about 8 GB of video memory; the CPU works, slowly).

```sh
git clone <this repository> sosie && cd sosie
uv venv --python 3.11 && uv pip install -e ".[voice]"     # or: python -m venv .venv && .venv/bin/pip install -e ".[voice]"
.venv/bin/sosie                                            # opens the studio in the browser (Chrome app window if available)
```

The studio alone (recording, no synthesis) only needs `pip install -e .`. The first use downloads the models from Hugging Face (Whisper large-v3-turbo for the takes, Chatterbox and Whisper large-v3 for synthesis).

## Command line

```sh
sosie [PROJECT]                                   # the studio, on a project (default: the last one)
sosie init my-film --script script.md --lang fr   # new project from a script (.txt/.md/.srt/.json), --film video.mp4 for the picture
sosie say "Hello there." --voice me-en --out hello.wav
sosie render my-film --voice me-fr --out my-film/guide   # every line in a voice; lines already made are skipped
sosie tempo track/ track-fast/ 1.15               # speed a voice track up (WSOLA), word timings included
sosie voice list | add NAME --lang fr [--ref sample.wav] | import ID file.wav | from-project ID --project DIR [--ids A,B]
```

## Where things live

```
<project>/                      any folder you choose
  sosie.json                    name, language, optional film and paths
  script.json                   chapters and lines {"id", "text"}
  timing.json                   optional: where each line sits in the film {id: {start, dur, vo}}
  takes/<id>/tNN.wav + .json    every take (24-bit) and its analysis
  selection.json                the kept take of each line
  noise.wav                     the background noise profile
  guide/                        optional guide voice: the rythmo band's timing, and the fallback for lines without a take
  export/                       the voice track: <id>.wav (48 kHz 16-bit, −20 LUFS), durations.json, words.json
  lexicon.json                  optional pronunciation rules {"rules": [[regex, replacement]], "spell": ["API", …]}
~/.local/share/sosie/           ($SOSIE_HOME)
  voices/<id>/                  ref.wav + settings (a voice folder is also the project of its samples)
  clips/                        clips made in the synthesis panel
  trash/                        deleted voices and clips (nothing is erased)
```

Every path of a project can be redirected in `sosie.json` (`"paths": {"export": "../assets/vo/fr", …}`), so an existing production keeps its own layout. A **voice track** folder (`<id>.wav`, `durations.json` with `{id: {text, dur}}`, `words.json` with one `{t, s, e}` per word of the text) is the common format for exports, guides and rendered projects: an edit script can lay the voice on the picture word by word.

## What makes the clone sound right

These are the settings and rules that survived listening tests; the code keeps them as defaults.

- **A 30-second reference, given in full to the decoder** (`decoder_seconds` 30): much better timbre than the default 10 s.
- **The reference sets the accent**: a French reference speaking English gives a French accent. Record the reference in the language the voice will speak.
- **The first 6 seconds set the tone**: the text model only hears them. The first sample sentence is the one to read best.
- **A calm delivery**: `exaggeration` 0.35, `cfg_weight` 0.3, `temperature` 0.6.
- **Several draws per sentence, checked by Whisper**: a draw with a missing word, invented words, a long silence or a runaway rate is rejected; among the good ones, the closest to the real voice wins.
- **Speeding a slow clone up with WSOLA** (ffmpeg `atempo`, voice setting `tempo`): phase-vocoder stretchers (Rubber Band R2 and R3) made the voice metallic.

## Ethics

Clone your own voice, or a voice whose owner gave explicit consent. Generated files carry Resemble AI's inaudible [Perth](https://github.com/resemble-ai/Perth) watermark by default, so synthetic speech can be detected; it can be turned off per voice, for private use.

## Roadmap

- **Live voice conversion** (voice in, cloned voice out, about 0.7 s behind): measured feasible on an RTX 4090 Laptop, see [docs/realtime.md](docs/realtime.md).
- PyPI release: waits for Chatterbox Multilingual V3 in a PyPI release (installed from its Git commit meanwhile).
- Export of a whole project (takes and voice track) as one archive.

## Credits

Chatterbox (MIT) by Resemble AI, faster-whisper (MIT) by SYSTRAN, Whisper (MIT) by OpenAI, num2words (LGPL), pyloudnorm (MIT).
