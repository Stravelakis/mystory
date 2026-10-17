#!/usr/bin/env bash
# One-time setup of the speech engine on the mini PC. Run from the checkout:
#   bash engine/linux/install.sh
# Everything goes into engine/.venv and a user service. No root.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 -m venv engine/.venv
engine/.venv/bin/pip install --upgrade pip >/dev/null
# No graphics card here: skip the CUDA packages.
grep -v '^nvidia-' engine/requirements.txt | grep -v -e pystray -e Pillow > /tmp/mystory-stt-req.txt
engine/.venv/bin/pip install -r /tmp/mystory-stt-req.txt
echo "Downloading large-v3-turbo (about 1.6 GB, once)..."
engine/.venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu', compute_type='int8')"
mkdir -p ~/.config/systemd/user
sed "s#%h/mystory#$PWD#g" engine/linux/mystory-stt.service > ~/.config/systemd/user/mystory-stt.service
systemctl --user daemon-reload
systemctl --user enable --now mystory-stt.service
echo "Running. Check with: curl -s http://127.0.0.1:40667/health"
