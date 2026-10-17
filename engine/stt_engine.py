"""My Story speech engine: local Whisper, the way My Story expects a transcriber.

    python engine/stt_engine.py                     # mini PC (no tray)
    pythonw engine/stt_engine.py --tray             # laptop, with the taskbar icon

Answers, in the OpenAI shape My Story already speaks:
    GET  /v1/models
    POST /v1/audio/transcriptions
and its own:
    GET  /health      {"state": "ready" | "paused" | "loading" | "failed", ...}
    POST /pause       unload the model, release the graphics memory
    POST /resume      load it again

While paused or loading, transcription answers 503 at once, so My Story steps
to the next engine (the mini PC) without waiting.

Which model: training/out/ct2 (your trained voice) when it exists, otherwise
large-v3 on a graphics card and large-v3-turbo on a processor. --model wins.

Binds to 127.0.0.1 unless --host says otherwise. Use a Tailscale address,
never 0.0.0.0 on a network you do not control: this hears a journal.
"""

import argparse
import gc
import logging
import os
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRAINED = ROOT / "training" / "out" / "ct2"
LOG_FILE = ROOT / "engine" / "engine.log"

log = logging.getLogger("stt")

# Whisper's well-known inventions on silence or noise. A piece that is only
# one of these is dropped. Seen in this project: "Υπότιτλοι AUTHORWAVE".
HALLUCINATIONS = (
    "υπότιτλοι",
    "authorwave",
    "ευχαριστώ που παρακολουθήσατε",
    "ευχαριστούμε που παρακολουθήσατε",
    "thank you for watching",
    "thanks for watching",
    "subtitles by",
    "amara.org",
)

ALLOWED = ("el", "en")


def is_hallucination(text: str) -> bool:
    t = text.strip().lower()
    if not t:
        return True
    return any(h in t for h in HALLUCINATIONS) and len(t) < 80


class Engine:
    """Owns the model. Everything that touches it holds the lock."""

    def __init__(self, model: str, device: str, explicit: bool = False):
        self.model_name = model
        self.explicit = explicit
        self.device_wanted = device
        self.device = "?"
        self.model = None
        self.state = "paused"
        self.error = ""
        self.lock = threading.Lock()
        self.listeners: list = []

    def _set(self, state: str, error: str = "") -> None:
        self.state, self.error = state, error
        for fn in self.listeners:
            try:
                fn()
            except Exception:
                pass

    def load(self) -> None:
        from faster_whisper import WhisperModel

        with self.lock:
            if self.model is not None:
                return
            # A voice trained since the engine started is picked up on Resume.
            if not self.explicit and TRAINED.exists():
                self.model_name = str(TRAINED)
            self._set("loading")
            try:
                if self.device_wanted in ("auto", "cuda"):
                    try:
                        self.model = WhisperModel(self.model_name, device="cuda", compute_type="float16")
                        self.device = "cuda"
                    except Exception as e:  # no card, no driver, or not enough memory
                        if self.device_wanted == "cuda":
                            raise
                        log.warning("graphics card unavailable (%s), using the processor", e)
                if self.model is None:
                    self.model = WhisperModel(self.model_name, device="cpu", compute_type="int8")
                    self.device = "cpu"
                log.info("ready: %s on %s", self.model_name, self.device)
                self._set("ready")
            except Exception as e:
                log.exception("load failed")
                self.model = None
                self._set("failed", str(e))

    def unload(self) -> None:
        with self.lock:
            self.model = None
            gc.collect()
            log.info("paused: model unloaded")
            self._set("paused")

    def transcribe(self, path: str, language: str, prompt: str) -> dict:
        with self.lock:
            if self.model is None:
                raise RuntimeError(self.state)
            m = self.model
            lang = language if language in ALLOWED else None
            kw = dict(
                initial_prompt=prompt or None,
                vad_filter=True,  # long pauses are silence, not words
                vad_parameters={"min_silence_duration_ms": 700},
                beam_size=5,
                condition_on_previous_text=False,  # one bad line must not poison the rest
                no_speech_threshold=0.6,
                compression_ratio_threshold=2.4,
            )
            from faster_whisper import decode_audio

            audio = decode_audio(path)
            if lang is None:
                # Greek and English only. Whisper would otherwise happily call
                # accented Greek "Russian" or translate it. The segments are a
                # lazy generator, so asking for info alone decodes nothing.
                _, probe = m.transcribe(audio, language=None, vad_filter=True)
                scores = {code: p for code, p in (probe.all_language_probs or []) if code in ALLOWED}
                lang = max(scores, key=scores.get) if scores else "el"
            segments, info = m.transcribe(audio, language=lang, **kw)
            texts = []
            for s in segments:
                t = s.text.strip()
                if s.no_speech_prob > 0.6 and s.avg_logprob < -1.0:
                    continue
                if is_hallucination(t):
                    continue
                texts.append(t)
            return {"text": " ".join(texts).strip(), "language": lang, "duration": info.duration}


def build_app(engine: Engine, token: str):
    from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

    app = FastAPI()

    def check(auth: str | None) -> None:
        if token and (auth or "") != f"Bearer {token}":
            raise HTTPException(401, "wrong token")

    @app.get("/health")
    def health():
        return {"state": engine.state, "device": engine.device, "model": engine.model_name, "error": engine.error}

    @app.post("/pause")
    def pause(authorization: str | None = Header(None)):
        check(authorization)
        engine.unload()
        return {"state": engine.state}

    @app.post("/resume")
    def resume(authorization: str | None = Header(None)):
        check(authorization)
        threading.Thread(target=engine.load, daemon=True).start()
        return {"state": "loading"}

    @app.get("/v1/models")
    def models():
        return {"object": "list", "data": [{"id": "my-voice", "object": "model"}]}

    @app.post("/v1/audio/transcriptions")
    async def transcriptions(
        file: UploadFile = File(...),
        model_name: str = Form("my-voice", alias="model"),
        language: str = Form(""),
        prompt: str = Form(""),
        authorization: str | None = Header(None),
    ):
        check(authorization)
        if engine.state != "ready":
            raise HTTPException(503, f"speech engine is {engine.state}")
        suffix = "." + (file.filename or "a.webm").rsplit(".", 1)[-1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(await file.read())
            path = f.name
        try:
            started = time.time()
            out = engine.transcribe(path, language, prompt)
            log.info("%.1fs of audio in %.1fs (%s)", out["duration"], time.time() - started, out["language"])
            return out
        except RuntimeError as e:
            raise HTTPException(503, f"speech engine is {e}")
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    return app


def run_tray(engine: Engine, serve) -> None:
    """The taskbar icon. Pause frees the graphics memory; Quit ends it all."""
    import pystray
    from PIL import Image, ImageDraw

    colours = {"ready": "#3cb44b", "loading": "#ffb000", "paused": "#888888", "failed": "#e6194b"}
    labels = {
        "ready": "Ready",
        "loading": "Loading…",
        "paused": "Paused (graphics memory free)",
        "failed": "Problem — see the log",
    }

    def image(state: str):
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.ellipse((6, 6, 58, 58), fill=colours.get(state, "#888888"))
        return img

    def status(_):
        where = " (graphics card)" if engine.device == "cuda" else " (processor)" if engine.device == "cpu" else ""
        return f"My Story speech: {labels.get(engine.state, engine.state)}{where if engine.state == 'ready' else ''}"

    def toggle(icon, _):
        if engine.state in ("ready", "failed"):
            threading.Thread(target=engine.unload, daemon=True).start()
        elif engine.state == "paused":
            threading.Thread(target=engine.load, daemon=True).start()

    def toggle_label(_):
        return "Resume" if engine.state in ("paused",) else "Pause — free graphics memory"

    def open_log(icon, _):
        if sys.platform == "win32":
            os.startfile(LOG_FILE)  # type: ignore[attr-defined]

    def quit_(icon, _):
        icon.stop()
        os._exit(0)

    icon = pystray.Icon(
        "mystory-stt",
        image(engine.state),
        "My Story speech",
        menu=pystray.Menu(
            pystray.MenuItem(status, None, enabled=False),
            pystray.MenuItem(toggle_label, toggle, default=True),
            pystray.MenuItem("Open log", open_log),
            pystray.MenuItem("Quit", quit_),
        ),
    )

    def refresh():
        icon.icon = image(engine.state)
        icon.title = status(None)
        icon.update_menu()

    engine.listeners.append(refresh)
    threading.Thread(target=serve, daemon=True).start()
    threading.Thread(target=engine.load, daemon=True).start()
    icon.run()


def add_cuda_dlls() -> None:
    """On Windows the CUDA libraries come as pip packages (nvidia-cublas-cu12,
    nvidia-cudnn-cu12) inside the engine's own folder. Point the loader at
    them, so nothing has to be installed system-wide."""
    if sys.platform != "win32":
        return
    import site

    for sp in site.getsitepackages():
        nv = Path(sp) / "nvidia"
        if nv.is_dir():
            for bin_dir in nv.glob("*/bin"):
                os.add_dll_directory(str(bin_dir))
                os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="", help="a faster-whisper model name or folder")
    ap.add_argument("--host", default=os.environ.get("STT_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("STT_PORT", "40666")))
    ap.add_argument("--device", default="auto", help="cuda, cpu or auto")
    ap.add_argument("--token", default=os.environ.get("STT_TOKEN", ""), help="required as a Bearer token if set")
    ap.add_argument("--tray", action="store_true", help="show the taskbar icon (Windows laptop)")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(LOG_FILE, encoding="utf-8")] + ([] if args.tray else [logging.StreamHandler()]),
    )

    add_cuda_dlls()
    model = args.model
    if not model:
        if TRAINED.exists():
            model = str(TRAINED)
        else:
            model = "large-v3-turbo" if args.device == "cpu" else "large-v3"
    engine = Engine(model, args.device, explicit=bool(args.model))

    import uvicorn

    app = build_app(engine, args.token)

    def serve():
        uvicorn.run(app, host=args.host, port=args.port, log_level="warning")

    if args.tray:
        run_tray(engine, serve)
    else:
        engine.load()
        serve()


if __name__ == "__main__":
    main()
