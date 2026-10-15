#!/usr/bin/env bash
# Sosie installer (Linux, macOS): uv, a Python environment, Sosie, the models, the demo project and a `sosie` command.
#
#   curl -fsSL https://raw.githubusercontent.com/damienlaine/sosie/main/install.sh | bash
#   ./install.sh [--no-synthesis] [--no-models] [--dir PATH] [--lang fr|en] [--no-desktop]
#
# --no-synthesis   the recording studio only (no voice cloning: no PyTorch, no GPU needed, ~2 GB on disk instead of ~14 GB)
# --no-models      install the software, download the models later with `sosie setup`
# --dir PATH       where to put Sosie when the script is not run from a clone (default: ~/.local/share/sosie/app)
# --lang fr|en     language of the demo project (default: the system's)
# --no-desktop     no menu entry (Linux)
set -euo pipefail

REPO="https://github.com/damienlaine/sosie.git"
DIR="${SOSIE_DIR:-$HOME/.local/share/sosie/app}"
SYNTH=1 MODELS=1 DESKTOP=1 LANG_OPT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-synthesis) SYNTH=0 ;;
    --no-models) MODELS=0 ;;
    --no-desktop) DESKTOP=0 ;;
    --dir) DIR="$2"; shift ;;
    --lang) LANG_OPT="--lang $2"; shift ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

OS="$(uname -s)"
case "$OS" in Linux|Darwin) ;; *) fail "Linux or macOS only (on Windows, use WSL2: see the README)." ;; esac

# ---------------------------------------------------------------- prerequisites
need_pkg() {   # how to install a missing tool on this system
  if [ "$OS" = Darwin ]; then echo "brew install $1"
  elif command -v apt-get >/dev/null; then echo "sudo apt-get install -y $1"
  elif command -v dnf >/dev/null; then echo "sudo dnf install -y $1"
  elif command -v pacman >/dev/null; then echo "sudo pacman -S $1"
  elif command -v zypper >/dev/null; then echo "sudo zypper install $1"
  else echo "your package manager: $1"; fi
}
command -v git >/dev/null || fail "git is missing. Install it: $(need_pkg git)"
command -v ffmpeg >/dev/null || fail "ffmpeg is missing (Sosie uses it for every audio file). Install it: $(need_pkg ffmpeg)"
command -v ffprobe >/dev/null || fail "ffprobe is missing (it comes with ffmpeg). Install it: $(need_pkg ffmpeg)"
command -v curl >/dev/null || fail "curl is missing. Install it: $(need_pkg curl)"

if ! command -v uv >/dev/null; then
  say "Installing uv (the Python package manager Sosie uses: https://docs.astral.sh/uv/)"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
  command -v uv >/dev/null || fail "uv did not install; see https://docs.astral.sh/uv/getting-started/installation/"
fi

# ---------------------------------------------------------------- the code
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "$HERE" ] && [ -f "$HERE/pyproject.toml" ] && grep -q '^name = "sosie"' "$HERE/pyproject.toml"; then
  DIR="$HERE"
  say "Using this clone: $DIR"
elif [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" pull --ff-only
else
  say "Downloading Sosie into $DIR"
  mkdir -p "$(dirname "$DIR")"
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

# ---------------------------------------------------------------- Python environment
say "Creating the Python environment (Python 3.11, in $DIR/.venv)"
uv venv --python 3.11 --allow-existing .venv >/dev/null
if [ "$SYNTH" = 1 ]; then
  say "Installing Sosie with voice cloning (PyTorch, Chatterbox: a few GB, a few minutes)"
  uv pip install --python .venv/bin/python -e ".[voice]"
else
  say "Installing Sosie (recording studio only)"
  uv pip install --python .venv/bin/python -e .
fi

# ---------------------------------------------------------------- models and demo project
if [ "$MODELS" = 1 ]; then
  say "Downloading the models and creating the demo project"
  # shellcheck disable=SC2086
  .venv/bin/sosie setup $([ "$SYNTH" = 1 ] || echo --no-synthesis) $LANG_OPT
fi

# ---------------------------------------------------------------- the `sosie` command and the menu entry
BIN="$HOME/.local/bin"
mkdir -p "$BIN"
ln -sf "$DIR/.venv/bin/sosie" "$BIN/sosie"
say "Command installed: $BIN/sosie"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "   (add $BIN to your PATH, e.g. in ~/.bashrc: export PATH=\"\$HOME/.local/bin:\$PATH\")" ;; esac

if [ "$OS" = Linux ] && [ "$DESKTOP" = 1 ]; then
  APPS="$HOME/.local/share/applications"
  mkdir -p "$APPS"
  cat > "$APPS/sosie.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Sosie
Comment=Voice-over studio, voice cloning and speech synthesis
Exec=$BIN/sosie
Icon=$DIR/sosie/static/icon.svg
Terminal=true
Categories=AudioVideo;Audio;Recorder;
EOF
  say "Menu entry added: Sosie"
fi

command -v google-chrome >/dev/null || command -v chromium >/dev/null || command -v chromium-browser >/dev/null \
  || echo "   Note: Sosie opens in your default browser; Chrome or Chromium is advised (app window, microphone access)."

say "Done. Start Sosie with:  sosie        (or: sosie demo, for the five-line demo project)"
