# The speech engine

Your own Whisper, on your own machines. My Story asks it first; the cloud is
only the fallback.

| Machine | Role | Runs on |
|---|---|---|
| Laptop | first choice | the graphics card |
| Mini PC | when the laptop is off, asleep or paused | the processor |

## Laptop: one time

1. Install **Python 3.12** from python.org. Tick **"Add python.exe to PATH"**.
2. Open the My Story folder → `engine` → `windows`.
3. Double-click **Install speech engine**. It downloads about 5 GB and takes
   10–30 minutes. When it says Done, two shortcuts are on your Desktop.
4. Double-click **My Story speech** on the Desktop.
   - The first time, Windows Firewall may ask. Choose **Allow** (private networks).
   - A round icon appears near the clock. **Green** = ready.

## Laptop: every day

| Want | Do |
|---|---|
| Start it | Desktop → **My Story speech** |
| Free the graphics memory (gaming) | right-click the icon → **Pause** |
| Use it again | right-click → **Resume** (about 15 s) |
| Close it | right-click → **Quit** |

Paused or closed, the mini PC takes over within seconds. Nothing waits.

## Mini PC: one time

```bash
cd ~/apps/mystory && git pull --ff-only
bash engine/linux/install.sh
```

It installs into `engine/.venv` (no root) and starts the user service
`mystory-stt` on `127.0.0.1:40667`. Check: `curl -s http://127.0.0.1:40667/health`.

## Tell My Story where they are

Settings → Models:

| Field | Value |
|---|---|
| Speech engine on the laptop → Endpoint | `http://<laptop's Tailscale name>:40666/v1` |
| Local transcription (mini PC) → Endpoint | `http://127.0.0.1:40667/v1` |

Then Settings → Your voice → **Measure**: every engine is scored on your own
reading. Choose **Greek + English (mixed)** as the spoken language if you mix.

## Train on your voice

Desktop → **Train on my voice**. About an hour; the laptop's graphics card is
busy meanwhile. It fetches your reading from the mini PC (`ssh minipc` must
work; change the name in `engine\settings.bat`, copied from
`settings.example.bat`), pauses the engine, trains, and prints **BEFORE /
AFTER**. The new voice is kept only if it is clearly better, and is then
copied to the mini PC too.

## Ports

| Port | What |
|---|---|
| 40666 | laptop engine, on its Tailscale address only |
| 40667 | mini PC engine, on 127.0.0.1 only |
