# Plan — accurate Greek, interviewer, ghostwriter, Video-Forge export

Agreed with the owner 17 Oct 2026. Free only: no paid services.

| # | Phase | Status | Model to build it |
|---|---|---|---|
| 1 | Local speech engine (laptop graphics card → mini PC → Groq free → Gemini) | **done** | Opus, low |
| 2 | Live session: words 1–5 s after each pause, tags fade in about once a minute | **done** | Opus, low |
| 3 | Crash-proofing: pieces kept in the browser, job resume, live reconnect | **done** | Opus, low |
| 4 | Interviewer | next | Sonnet, medium |
| 5 | Ghostwriter | | Sonnet, medium |
| 6 | Video-Forge export | | Sonnet, medium |

## Decisions (do not relitigate)

- **Local model: yes** (reverses the earlier "no local model"). Laptop first for its VRAM; mini PC when unavailable.
- Laptop engine starts from a **Desktop shortcut**; taskbar icon with **Pause** (frees VRAM), Resume, Quit. No Windows startup items or services.
- Spoken language: Greek, English, or **Greek + English (mixed)**, limited to those two.
- A 2–5 s delay for words is fine (slow speaker).
- Everything recorded at least as text, in markdown.
- **Video-Forge is never changed.** Export matches its format exactly.

## 4. Interviewer (text on screen only)

- **Off by default.** A switch and a key turn it on/off at any time. Off = silent.
- On: opens with "What would you like to talk about?", then follows the owner's topic.
- Asks only after the owner has been silent N seconds (default 30, adjustable 15–120), never while words are arriving.
- **Suggest topics** only when asked (button). **Ask me** gives one question now.
- Questions and answers saved in the session's markdown. Runs on the existing free Gemini tier.

## 5. Ghostwriter

- `vault/life/map.md`: life periods, people, places, built from entries; covered or thin.
- `vault/book/<period>.md`: first person, the owner's style, each paragraph linked to its source entries (the existing citation check).
- Redrafts only chapters whose entries changed.

## 6. Video-Forge export (download button)

- A .zip with `<name>.txt` (Video-Forge `Label: text` script lines) and `<name>.json` (its `BatchJob`).
- The job copies cast/preset/format from one of the owner's own Video-Forge jobs, uploaded once in Settings; fills scriptPath, language, topic.
- Tests check the script against Video-Forge's rules (`electron/tts/checkScript.ts`, `docs/WRITING-SCRIPTS.md` in DnD-World/Video-Forge).
