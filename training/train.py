"""Fine-tunes Whisper on one person's voice, and says honestly whether it helped.

    python training/train.py --data training/data --out training/out

What it does:
  1. Measures the untouched model on the held-back test clips (word error rate).
  2. Trains a LoRA adapter on the training clips. LoRA changes a small add-on
     instead of the whole model, which is what lets an 8 GB graphics card do
     this, and what keeps a small amount of speech from wrecking the rest of
     what the model knows.
  3. Measures again on the same test clips, and prints before and after.
  4. Saves the merged model, and a CTranslate2 copy for serve.py.

If the "after" number is not clearly lower, do not use the result. That is
the point of step 1.

Out of memory on the 3070? Lower --batch to 2 (and raise --accum to 8). Still
out of memory, or no NVIDIA card: run the same command on a rented cloud GPU
(any 16-24 GB card), one time, then copy training/out back.
"""

import argparse
import json
import random
import re
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from peft import LoraConfig, get_peft_model
from transformers import (
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    WhisperForConditionalGeneration,
    WhisperProcessor,
)

LANG = {"el": "greek", "en": "english"}


# ---- scoring: the same normalisation as the app (voice.ts) -----------------

def normalise(text: str) -> list[str]:
    t = unicodedata.normalize("NFD", text)
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).lower().replace("ς", "σ")
    t = re.sub(r"[^\w\s]", " ", t)
    return t.split()


def wer(refs: list[str], hyps: list[str]) -> float:
    errors = total = 0
    for r, h in zip(refs, hyps):
        a, b = normalise(r), normalise(h)
        d = list(range(len(b) + 1))
        for i in range(1, len(a) + 1):
            prev, d[0] = d[0], i
            for j in range(1, len(b) + 1):
                cur = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
                prev, d[j] = d[j], cur
        errors += d[len(b)]
        total += max(1, len(a))
    return errors / max(1, total)


# ---- data ------------------------------------------------------------------

def load(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


class Clips(torch.utils.data.Dataset):
    def __init__(self, rows, processor):
        self.rows, self.p = rows, processor

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        audio, sr = sf.read(r["audio"], dtype="float32")
        assert sr == 16000, "run prepare.py first"
        feats = self.p.feature_extractor(audio, sampling_rate=16000).input_features[0]
        self.p.tokenizer.set_prefix_tokens(language=LANG.get(r["language"], "greek"), task="transcribe")
        labels = self.p.tokenizer(r["text"]).input_ids
        return {"input_features": feats, "labels": labels}


def collate(processor):
    def fn(batch):
        feats = processor.feature_extractor.pad(
            [{"input_features": b["input_features"]} for b in batch], return_tensors="pt"
        )
        labels = processor.tokenizer.pad([{"input_ids": b["labels"]} for b in batch], return_tensors="pt")
        ids = labels["input_ids"].masked_fill(labels.attention_mask.ne(1), -100)
        # The model adds the start token itself; a second one would be learned as speech.
        if (ids[:, 0] == processor.tokenizer.convert_tokens_to_ids("<|startoftranscript|>")).all():
            ids = ids[:, 1:]
        feats["labels"] = ids
        return feats

    return fn


@torch.no_grad()
def transcribe(model, processor, rows, device) -> list[str]:
    model.eval()
    out = []
    for r in rows:
        audio, _ = sf.read(r["audio"], dtype="float32")
        feats = processor(audio, sampling_rate=16000, return_tensors="pt").input_features.to(device, torch.float16)
        ids = model.generate(
            input_features=feats, language=LANG.get(r["language"], "greek"), task="transcribe", max_new_tokens=200
        )
        out.append(processor.batch_decode(ids, skip_special_tokens=True)[0].strip())
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="training/data")
    ap.add_argument("--out", default="training/out")
    ap.add_argument("--base", default="openai/whisper-large-v3-turbo")
    ap.add_argument("--epochs", type=float, default=4)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--accum", type=int, default=4)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--rank", type=int, default=32)
    ap.add_argument("--no-convert", action="store_true", help="skip the CTranslate2 copy")
    args = ap.parse_args()

    random.seed(0)
    torch.manual_seed(0)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("No CUDA GPU found. This will be very slow; consider a cloud GPU (see the top of this file).")

    data, out = Path(args.data), Path(args.out)
    train_rows, test_rows = load(data / "train.jsonl"), load(data / "test.jsonl")
    print(f"{len(train_rows)} training clips, {len(test_rows)} test clips")

    processor = WhisperProcessor.from_pretrained(args.base)
    model = WhisperForConditionalGeneration.from_pretrained(args.base, torch_dtype=torch.float16).to(device)
    model.generation_config.forced_decoder_ids = None

    refs = [r["text"] for r in test_rows]
    before = wer(refs, transcribe(model, processor, test_rows, device))
    print(f"\nBEFORE: {before:.1%} of words wrong on your test clips\n")

    # LoRA on the attention projections. Trained in fp32 on top of fp16
    # weights, which is stable without an 8-bit library (awkward on Windows).
    model = model.float()
    model = get_peft_model(
        model,
        LoraConfig(r=args.rank, lora_alpha=args.rank * 2, lora_dropout=0.05, target_modules=["q_proj", "k_proj", "v_proj", "out_proj"]),
    )
    model.print_trainable_parameters()
    model.base_model.model.model.encoder.conv1.register_forward_hook(lambda m, i, o: o.requires_grad_(True))

    trainer = Seq2SeqTrainer(
        model=model,
        args=Seq2SeqTrainingArguments(
            output_dir=str(out / "checkpoints"),
            per_device_train_batch_size=args.batch,
            gradient_accumulation_steps=args.accum,
            learning_rate=args.lr,
            warmup_ratio=0.1,
            num_train_epochs=args.epochs,
            fp16=device == "cuda",
            gradient_checkpointing=True,
            logging_steps=10,
            save_strategy="no",
            report_to=[],
            dataloader_num_workers=0,  # Windows
            remove_unused_columns=False,
            label_names=["labels"],
        ),
        train_dataset=Clips(train_rows, processor),
        data_collator=collate(processor),
    )
    trainer.train()

    merged = model.merge_and_unload().half()
    after = wer(refs, transcribe(merged, processor, test_rows, device))
    print(f"\nBEFORE: {before:.1%}   AFTER: {after:.1%}   (words wrong on clips it never trained on)")
    if after >= before * 0.9:
        print("Not a clear improvement. Keep using the current engine; more reading may help.")

    merged_dir = out / "merged"
    merged.save_pretrained(merged_dir)
    processor.save_pretrained(merged_dir)
    (out / "result.json").write_text(json.dumps({"base": args.base, "before": before, "after": after}), encoding="utf-8")

    if not args.no_convert:
        import subprocess

        subprocess.run(
            [
                "ct2-transformers-converter", "--model", str(merged_dir), "--output_dir", str(out / "ct2"),
                "--quantization", "int8_float16", "--copy_files", "tokenizer.json", "preprocessor_config.json", "--force",
            ],
            check=True,
        )
        print(f"Ready for serve.py: {out / 'ct2'}")


if __name__ == "__main__":
    main()
