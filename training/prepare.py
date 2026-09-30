"""Turns the clips from Settings -> Your voice into a training set.

    python training/prepare.py --voice path/to/vault/voice --out training/data

Every clip is converted to 16 kHz mono WAV (what Whisper hears) with ffmpeg,
and paired with the sentence it was reading. Every tenth clip is held back
as a test set, never trained on, so "before" and "after" are measured on
sentences the model has not seen.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--voice", required=True, help="the vault's voice/ folder (contains clips.json)")
    ap.add_argument("--out", default="training/data")
    ap.add_argument("--test-every", type=int, default=10)
    args = ap.parse_args()

    voice = Path(args.voice)
    clips = json.loads((voice / "clips.json").read_text(encoding="utf-8"))
    script = {l["n"]: l for l in json.loads((voice / "script.json").read_text(encoding="utf-8"))}
    out = Path(args.out)
    (out / "wav").mkdir(parents=True, exist_ok=True)

    rows = {"train": [], "test": []}
    for i, c in enumerate(clips):
        src = voice / c["file"]
        dst = out / "wav" / f"{c['n']:04d}.wav"
        if not src.exists():
            print(f"missing {src}, skipped", file=sys.stderr)
            continue
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-ac", "1", "-ar", "16000", str(dst)],
            check=True,
        )
        split = "test" if (i + 1) % args.test_every == 0 else "train"
        rows[split].append(
            {"audio": str(dst.resolve()), "text": c["text"], "language": script.get(c["n"], {}).get("language", "el")}
        )

    for split, items in rows.items():
        with open(out / f"{split}.jsonl", "w", encoding="utf-8") as f:
            for r in items:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    minutes = sum(Path(r["audio"]).stat().st_size for r in rows["train"]) / 32000 / 60
    print(f"train: {len(rows['train'])} clips (~{minutes:.0f} min), test: {len(rows['test'])} clips -> {out}")


if __name__ == "__main__":
    main()
