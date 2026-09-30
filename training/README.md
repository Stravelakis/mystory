# Training a model on your voice

This is the modern version of the old "read these passages so it learns your
voice" setup. Do it **after** you've read at least 30 minutes in
**Settings → Your voice**, and after **Measure** has shown what the existing
engines get wrong on your voice. If an engine already gets under about 5% of
your words wrong, training may not be worth the effort.

What it does:

1. It measures the untouched model on your clips, using sentences it will
   never train on.
2. It trains a small add-on (LoRA) to Whisper large-v3-turbo on the rest of
   your clips.
3. It measures again on the same unseen sentences and prints **before** and
   **after**. If "after" isn't clearly better, it tells you so. Don't use
   the result in that case.

Your recordings and the trained model stay on your machine
(`training/data/` and `training/out/` are git-ignored). Nothing is uploaded,
unless you choose to rent a cloud GPU for step 3.

## What you need

- An NVIDIA graphics card with 8 GB or more (an RTX 3070 works), or a
  rented cloud GPU for one session (any 16–24 GB card; about an hour).
- Python 3.11 or 3.12, and ffmpeg.
- About 10 GB of disk space for the model and libraries.

## Steps

```bash
# 1. copy your reading from the server (it lives in the vault)
scp -r minipc:~/.local/share/mystory/vault/voice ./training/voice

# 2. a separate Python environment, then PyTorch WITH CUDA from pytorch.org
python -m venv training/.venv
training/.venv/Scripts/activate           # Linux/macOS: source training/.venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu124
pip install -r training/requirements.txt

# 3. prepare, train, and see before / after
python training/prepare.py --voice training/voice --out training/data
python training/train.py --data training/data --out training/out

# 4. serve it, then add it in My Story
python training/serve.py --model training/out/ct2
```

In My Story, go to **Settings → Models → Local transcription**. Set the
endpoint to `http://127.0.0.1:40666/v1` and the model to `my-voice`, then run
**Your voice → Measure** again. It's ranked against the others on your own
clips, and **Use the best three** puts it first if it earned it.

## Where it runs afterwards

- **On the laptop's graphics card:** fast, but only while the laptop is on.
  The app falls back to the next engine when it's off.
- **On the mini PC:** it has no graphics card, so the model runs on the
  processor. That's fine for the careful pass after a session, since it
  isn't in a hurry, but too slow for live words. Live words stay on Gemini.

> ⚠️ A local transcription model goes against the "no local model for My
> Story" decision recorded in HANDOFF. It's here because a model trained on
> one voice can only run locally. Whether to use it is your call once
> Measure shows the numbers.

Out of memory on an 8 GB card? Add `--batch 2 --accum 8`.
