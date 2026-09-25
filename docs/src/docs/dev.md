## Dev

My Story is one Node process: an Express server (`server.ts`, bundled to `dist/server.cjs` by esbuild) serving a React 19 + Vite client (`src/App.tsx`). No database. Entries are markdown files with front matter, written atomically (temp file + rename). Trash is a folder; nothing is ever deleted.

### Run it

```bash
git clone https://github.com/Stravelakis/mystory.git
cd mystory
npm install
npm run dev          # http://localhost:38726
npm run desktop      # the Electron window
npm run build-exe    # NSIS installer + portable build in release/
```

Port **38726** was picked with the standards' `pick-port.mjs` (5 digits, 10000–49151, no pattern, no clash). Override with `PORT`; bind with `HOST` (default is dual-stack, because `localhost` resolves to `::1` on Windows).

### Architecture

```
src/App.tsx  ──fetch /api──►  server.ts  (routes only)
                                 │
       ┌──────────┬──────────────┼──────────────┬─────────────┐
    vault.ts   providers.ts   vocabulary.ts   episodes.ts   translate.ts
    (disk)     (every model)  (35 terms)      (chapters)    (DeepL / model)
                  │
               live.ts  (Gemini Live over WebSocket)
```

| Module | Owns |
|---|---|
| `providers.ts` | every model call: routing, fallbacks, token budgets, error explanations |
| `live.ts` | Gemini Live sessions: text jobs through speech, PCM16 conversion via ffmpeg |
| `vocabulary.ts` | the terms, the tagging prompt, and `normalise()`, which drops any label whose quote is not in the entry |
| `vault.ts` | entries, audio, `.trash/`, timeline order by *when it happened* |
| `episodes.ts` | groups dated entries by gap, drafts chapters, strips invented citations |
| `chapters.ts` | long chapters in parts: splits by an estimated token budget (`EPISODE_PART_TOKENS`, default 12000), saves each part to `vault/chapters/` as it lands, resumes from the first missing part |
| `env.ts` / `auth.ts` | `.env` allow-list and writes; scrypt passcode and signed sessions |
| `maintenance.ts` | Settings → Advanced: Repair and Update (GitHub Releases API, SemVer) |

### The model router

Six jobs: `transcribe`, `when`, `indicators`, `companion`, `title`, `synthesis`. Each has three slots, `MODEL_<JOB>_1/_2/_3 = provider::model`. A failure (quota, retired model, empty answer, or an answer that fails the job's `validate` check) steps to the next slot. The error that surfaces leads with the first failure, in plain English.

Provider kinds: `openai` (any `/v1` endpoint: Groq, Mistral, Cerebras, NVIDIA, OpenRouter, OmniRoute, local runtimes), `gemini` (Google SDK), `gemini-live` (bidiGenerateContent). A local model is just a provider with `local: true`.

Routing: `cloud-first`, `local-first`, `local-only`. Local-only is enforced twice: the chain excludes cloud providers, and middleware returns 409 on the Google routes.

**Consent gate.** Without `CLOUD_CONSENT=yes`, cloud providers (DeepL included) are filtered out of every chain. With no local provider left, the call fails with a message pointing at the checkbox.

### Gemini Live notes (checked 25 Sep 2026)

- `gemini-3.8-live-extended-thinking` has no TEXT output. The app asks for AUDIO with `outputAudioTranscription`, a "silent function" system instruction, and waits 1.5 s after `turnComplete`. An empty answer is retried once.
- `gemini-3.5-transcribe-live` returns `inputTranscription`; a 1008 close after the transcript is success.
- All Live audio is sent as 16 kHz mono PCM16, converted with ffmpeg.

### Data

```yaml
---
id: 20260816-142530-a3f
title: …
created: …                   # never rewritten
when: "the summer before I left school"
when_start: "2011"
when_end: "2011"
when_confidence: inferred    # stated | anchored | inferred | unknown
found: [{"id":"gaslighting","evidence":"…exact quote…"}]
verbatim: "…"                # the untidied transcript, if tidied
---
```

### Configuration

Every variable is listed in `.env.example`. The desktop app keeps `.env` and the vault in `%APPDATA%` (`MYSTORY_ENV_PATH`, `VAULT_DIR`), and uninstalling leaves them in place.

### Quality gates

`npm run lint` (tsc), `npm test` (vitest, no network) and `npm run build` run in CI on every push and PR, along with a gitleaks scan of the whole history. gitleaks also runs in the pre-commit hook (`git config core.hooksPath githooks`).
