"""Serves a trained voice model the way My Story expects a local transcriber.

    python training/serve.py --model training/out/ct2 --port 40666

It answers POST /v1/audio/transcriptions (the OpenAI shape) and GET
/v1/models. In My Story: Settings -> Models -> Local transcription, endpoint
http://<this machine>:40666/v1, model "my-voice". Then Settings -> Your voice
-> Measure, to see it ranked against the others on your own clips.

Binds to 127.0.0.1 by default. Anything else should be a Tailscale address,
never 0.0.0.0 on a network you do not control: this hears a journal.
"""

import argparse
import tempfile

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel

LANG = {"el": "el", "en": "en"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="training/out/ct2")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=40666)
    ap.add_argument("--device", default="auto", help="cuda, cpu or auto")
    args = ap.parse_args()

    compute = "int8_float16" if args.device in ("auto", "cuda") else "int8"
    try:
        model = WhisperModel(args.model, device=args.device, compute_type=compute)
    except ValueError:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")

    app = FastAPI()

    @app.get("/v1/models")
    def models():
        return {"object": "list", "data": [{"id": "my-voice", "object": "model"}]}

    @app.post("/v1/audio/transcriptions")
    async def transcriptions(
        file: UploadFile = File(...),
        model_name: str = Form("my-voice", alias="model"),
        language: str = Form(""),
        prompt: str = Form(""),
    ):
        with tempfile.NamedTemporaryFile(suffix="." + (file.filename or "a.webm").rsplit(".", 1)[-1], delete=False) as f:
            f.write(await file.read())
            path = f.name
        segments, _ = model.transcribe(
            path,
            language=LANG.get(language) or None,
            initial_prompt=prompt or None,
            vad_filter=True,  # long pauses are silence, not words
            beam_size=5,
        )
        return {"text": " ".join(s.text.strip() for s in segments).strip()}

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
