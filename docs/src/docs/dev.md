## Orientation

My Story is **one Node process**: an Express 5 server (`server.ts`, bundled to `dist/server.cjs` by esbuild) that serves a React 19 + Vite 8 client (`src/App.tsx`). TypeScript 7, Vitest 5, Electron 44 for the Windows shell. No database, no ORM, no state library. The product is a folder of **plain markdown files**; everything else (models, Google Drive, the interface) is replaceable around it.

Rules that decide arguments, in order:

1. **The recording survives everything.** Audio is written to disk before any model is called; the entry is written before anything goes to Drive.
2. **Local-only is a guarantee, not a preference.** It is enforced in code at the router and again in middleware, not by a UI hint.
3. **Entries and recordings are never deleted.** Trash is a folder move and rewrites keep a copy. Only temporary partial-recording files are removed once the whole recording is saved, and a re-recorded voice clip replaces the old one when the file extension changes.
4. **No quote, no label.** An indicator that comes with a quote not found in the entry is dropped. One given with no quote is kept, without evidence.

> **Watch out** This page describes the code at tag **v1.2.0** (30 Sep 2026). `main` already holds about twenty later commits (a local speech engine, an interviewer, a Story tab, a Video-Forge export, recording sets, audio clean-up). They are not released, so they are not documented here. If this page and the code disagree, the code wins; the engineering map is [HANDOFF.md](https://github.com/Stravelakis/mystory/blob/HEAD/HANDOFF.md).

## Run it

```bash
git clone https://github.com/Stravelakis/mystory.git
cd mystory
npm install
npm run dev            # http://localhost:38726
npm run lint           # tsc --noEmit  (vite build does NOT typecheck)
npm test               # vitest run, no network, no model calls
npm run build          # client -> dist/, server -> dist/server.cjs
npm start              # node dist/server.cjs
npm run desktop        # build, then the Electron window
npm run desktop:browser  # build, then the same server in your own browser
npm run build-exe      # NSIS installer + portable .exe -> release/
npm run gemini:doctor  # what a Google key can really reach
```

`npm run dev` is `tsx server.ts`: Express with Vite in middleware mode (any `NODE_ENV` except `production`). `npm run prepare` points git at `githooks/` (`core.hooksPath`); the pre-commit hook runs **gitleaks**, then refuses private addresses (Tailscale IPs, home-LAN IPs, `*.ts.net` names). Node 20 or newer (`engines`).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `38726` | Listen port. Chosen to avoid 3000, 3001, 4000, 5000, 5173, 8000, 8080 and 9000, and the clash with Image Forge's dev server on 3000. The boot error for a taken port suggests `PORT=38730`. |
| `HOST` | empty | Empty = dual-stack (IPv4 and IPv6). `localhost` resolves to `::1` first on Windows, so the old `0.0.0.0` default (IPv4 only) answered browsers but failed stricter clients. |
| `VAULT_DIR` | `./vault` | Where entries live. |
| `VAULT_KEEP_AUDIO` | on | `off` stops keeping recordings. |
| `MYSTORY_ENV_PATH` | `./.env` | Where settings live. Set by the Electron shell. |
| `INDICATORS_FILE` | built-in list | A JSON file that replaces the whole vocabulary. |
| `EPISODE_PART_TOKENS` | `12000` | Entry text allowed in one chapter part (estimated at one token per 3 characters). |
| `PROVIDER_TIMEOUT_MS` | `120000` | Per model call. |
| `GOOGLE_REDIRECT_URI` | `<protocol>://<host>/auth/callback` | The OAuth redirect. |

## Layout

```
src/App.tsx  --fetch /api-->  server.ts   (routes + WebSockets, ~2,100 lines)
                                 |
   vault.ts  providers.ts  vocabulary.ts  episodes.ts  chapters.ts  translate.ts
   (disk)    (every model)  (35 terms)    (chapters)   (in parts)   (DeepL, model)
                 |
              live.ts (Gemini Live over WebSocket)      google.ts (Drive, OAuth)
```

| File | Owns |
|---|---|
| `server.ts` | every route, the `/ws/journal` and `/ws/live` sockets, the lock middleware, the local-only middleware |
| `providers.ts` | **all** model access: provider list, routing, six jobs, fallbacks, token ceilings, plain-English errors, model listing |
| `live.ts` | Gemini Live: text jobs spoken back, transcription, live words |
| `vocabulary.ts` | the 35 terms, the tagging prompt, evidence validation |
| `vault.ts` | read, write, trash, audio containers, partial recordings, timeline order |
| `env.ts` | `.env` read/merge/write, the `CONFIG_KEYS` allow-list, secret masking |
| `auth.ts` | scrypt passcode, signed session cookie, attempt throttle |
| `google.ts` | server-side OAuth, refresh token, Drive and Docs |
| `translate.ts` | DeepL first, a model as fallback, never replacing the original |
| `episodes.ts`, `chapters.ts` | grouping entries by time; drafting a chapter in saved parts |
| `words.ts`, `voice.ts` | "My words" list; the "Your voice" reading and measuring |
| `maintenance.ts` | Repair (are the program's files present) and Update (asks GitHub) |
| `electron/main.cjs` | the Windows shell |
| `training/` | Python: LoRA fine-tune of Whisper on your own clips (not part of the app) |
| `src/styles/deco-noir.css` | the look, **vendored** (do not install it from npm) |

`src/App.tsx` is deliberately one file (about 4,800 lines). Splitting it is fine; splitting it while changing behaviour is not.

## The vault on disk

```
vault/
  20260816-142530-a3f.md          one entry
  audio/20260816-142530-a3f.webm  its recording (extension follows the container)
  audio/partial/<sid>.audio|.json a recording still in progress
  chapters/c-3f9a1b2c4d.md        a chapter, parts marked <!-- part N -->
  voice/script.json, clips.json, clips/0001.webm   the "Your voice" reading
  words.md                        the "My words" list
  .trash/                         trashed entries, audio and pre-rewrite copies
```

An entry id is `YYYYMMDD-HHMMSS-xxxx` (`^\d{8}-\d{6}-[a-z0-9]{4}$`); every id that reaches the filesystem is matched against it first. Front matter, in this order:

```yaml
---
id: 20260816-142530-a3f
title: …
created: <ISO, never rewritten>
updated: <ISO>
when: around when we moved          # the writer's own words, kept verbatim
when_start: 2009-06                 # a RANGE a model inferred, for ordering only
when_end: 2009-12
when_confidence: stated|anchored|inferred|unknown
indicators: Gaslighting, Fawn       # labels only, for a human reading the file
found: [{"id":"gaslighting","evidence":"…"}]   # one JSON line
verbatim: "…"                       # raw transcript, one JSON line, when text is the tidied version
audio: audio/20260816-142530-a3f.webm
drive: https://…                    # written back after a successful archive
---
```

The English translation is not front matter: it is appended under `\n\n---\n\n## In English\n\n` and split back off exactly on read, so the original text is never touched. Only the term `id` and the evidence are stored for an indicator; label, category and definition are read from the vocabulary at read time, so editing a definition updates every entry.

- **Writes** are temp file plus `rename`, mode `0600` (directories `0700`). `saveEntry` is write-through: fields the caller does not set are kept, so archiving can add a link without touching the text.
- **Trash** moves the entry and its audio into `.trash/` with a timestamp. `backupEntry` copies the file there before a rewrite such as **Transcribe again**.
- **Timeline**: `timelineKey` collapses a range to its midpoint, a partial date (`2009`, `2009-06`) to its own midpoint, and falls back to `created` when there is no "when" at all.
- **Audio containers**: Safari on iOS records MP4, Chrome and Firefox record WebM. The client asks `MediaRecorder.isTypeSupported`, sends the real type, and `vault.ts` stores the matching extension (`webm`, `m4a`, `mp3`, `ogg`, `wav`, `flac`). `findAudio(id)` resolves by prefix because early entries have no recorded extension. Never hard-code a container.

### Order of operations (do not rearrange)

1. A recording is saved in **5-second pieces** while you speak (`mediaRecorder.start(5000)`) to `POST /api/recordings/:sid/piece?seq=N` (raw body, up to 20 MB; a gap in `seq` returns 409 with the expected number).
2. On stop, the full file is uploaded (limit 400 MB, because 10 MB lost sessions of ten to twenty minutes) and an entry is created to hold it.
3. Transcription is attempted; the text goes into the entry.
4. Only then Drive. A dead token costs a sync, never a memory.

`GET /api/recordings/interrupted` lists recordings whose pieces stopped arriving more than 90 s ago and were never finished; `POST /api/recordings/:sid/recover` turns one into an entry. The UI offers it as **Recover it**.

## Config, secrets and the lock

`.env` is the only settings store. The browser may read or write **only** `CONFIG_KEYS` (provider keys, `MODEL_ROUTING`, `CLOUD_CONSENT`, endpoints, the 18 `MODEL_<JOB>_<1-3>` slots, Google client id and secret). `SECRET_KEYS` are masked on the way out; the client sends the mask back untouched and the server keeps the stored value, so a secret can be set but never read back. The server owns four more keys that never go through `/api/config`: `APP_PASSCODE_HASH`, `SESSION_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_ACCOUNT_EMAIL`. The file is written as `KEY="value"` lines, mode `0600`, and `process.env` is never serialised to it.

> **Watch out** `saveConfig` writes the file **and** `process.env`. `dotenv` copies `.env` into `process.env` at boot and `loadConfig()` layers `process.env` over the file, so writing only the file left every boot-time setting unchangeable until a restart (found 3 Sep 2026: a pasted corrected key appeared to do nothing).

**The lock** (`auth.ts`): one passcode, minimum four characters, stored as `scrypt$salt$key` (NFKC-normalised, constant-time compare). The session is a stateless HMAC-SHA256 cookie `mystory_session`: `HttpOnly`, `SameSite=Lax`, 30 days, `Secure` on https. No session table, so a restart signs nobody out. Five wrong guesses from one address buy a 60 s lockout (in memory). With no passcode set the API is open (`isAuthed` returns true), and the boot log warns when that is true on a non-loopback bind. Every `/api` route except `/api/auth/*` and the companion WebSocket require the session. The vault is **not encrypted at rest**.

Forgot it: delete the `APP_PASSCODE_HASH` line from `.env` and restart. Entries are plain files.

## The model router

Two driver shapes only. **`openai`**: any `/v1` endpoint (Groq, Mistral, Cerebras, NVIDIA NIM, OpenRouter, a custom gateway, every local runtime, every local Whisper server). **`gemini`** and **`gemini-live`**: Google's SDK. A local model is not a special case: it is a provider whose `local` flag is true.

| Provider id | Config | Notes |
|---|---|---|
| `local` | `LOCAL_CHAT_BASE_URL`, `_MODEL`, `_API_KEY`, `_LABEL` | local |
| `local-stt` | `LOCAL_STT_BASE_URL`, `_MODEL` | local; default model `Systran/faster-whisper-large-v3` |
| `openrouter` | `OPENROUTER_API_KEY` | **no defaults**: only used for a job you assigned it to |
| `omniroute` | `OMNIROUTE_BASE_URL`, `_API_KEY` | self-hosted gateway, but **not** marked local because it forwards to the cloud |
| `custom` | `CUSTOM_BASE_URL`, `_API_KEY`, `_LABEL` | any OpenAI-shaped endpoint |
| `groq`, `mistral`, `cerebras`, `nvidia` | `*_API_KEY` | cloud |
| `gemini`, `gemini-live` | `GEMINI_API_KEY` | `gemini` has no default model names; `gemini-live` defaults to `gemini-3.8-live-extended-thinking` for text jobs and `gemini-3.5-transcribe-live` for transcription |

Base URLs are normalised to end in `/v1`. Model names are **never** guessed: `listModels()` asks the endpoint (a plain GET, no generation cost) and Settings → **Load models** shows what each account really has. Hard-coded defaults exist only for Groq (`openai/gpt-oss-*`), Mistral (`mistral-small-latest`, `mistral-medium-latest`) and the two Live models, and carry a dated comment; OpenRouter, Gemini, Cerebras, NVIDIA and the custom endpoint have none.

**Six jobs** (`Task`): `transcribe`, `when`, `indicators`, `companion`, `title`, `synthesis`. Each has up to three slots, `MODEL_<TASK>_1`, `_2`, `_3`, each `"<providerId>::<model>"`. Output ceilings (`MAX_TOKENS`): when 3000, indicators 8000, companion 1500, title 1000, synthesis 8000. They are ceilings, not targets: a reasoning model used about 1,500 to 3,000 tokens on one two-sentence entry, mostly thinking, and returned nothing at the provider default.

`chat()` order: a model pinned for this run (the Synthesis picker), else the assigned slots, else the automatic chain. Every failure is recorded and stepped over; the thrown error leads with the **first** failure, because that was the user's first choice. A job with a required shape passes `validate`, so an answer in the wrong shape moves to the next model instead of becoming "nothing found".

### Routing and the consent gates

`MODEL_ROUTING` is `cloud-first` (default), `local-first` or `local-only`. These are the places that keep the promise:

| Where | What it does |
|---|---|
| `chainFor()` | `local-only` returns only providers with `local: true` |
| `chat()` and the transcription chain (`transcriptionCandidates()`) | the provider chain is filtered `p.local || CLOUD_CONSENT === 'yes'`, so cloud providers are not tried without consent; with no consent and no local provider the call throws the "Cloud AI is not switched on yet" message. DeepL is in no chain: see the note below |
| `POST /api/journal/translate` | refuses with that message unless `CLOUD_CONSENT` is `yes` |
| `/ws/live` | closes with `unavailable` if routing is local-only **or** consent is missing |
| `/api/google`, `/api/drive`, `/auth/callback` | middleware answers **409** while routing is local-only |

> **Watch out** DeepL (`translate.ts`) is gated by `CLOUD_CONSENT` only. With `CLOUD_CONSENT=yes`, a `DEEPL_API_KEY` set and routing `local-only`, `translate()` still calls DeepL. The only paths that check local-only for translation are Live Translate (`config.MODEL_ROUTING !== 'local-only'`) and the model fallback (through `chat()`). Leaving the consent box unticked closes every cloud path, DeepL included.

Live Translate is off unless `LIVE_TRANSLATE_MODEL` is set: it dropped the last sentence in every test. If enabled, a sentence-count and clean-ending guard rejects a short answer and DeepL takes over.

## Gemini Live

Everyday jobs go to Gemini's streaming Live API first. None of it behaves like the normal API (HANDOFF section 11 records each finding):

- Text jobs: the model **speaks** its answer; the code reads Google's transcript of the speech. It needs a thinking level, and a "silent function" system instruction, or it chats instead of answering. Each session carries about 2,600 tokens of Google's own preamble.
- Transcription (`gemini-3.5-transcribe-live`): returns the transcript as `inputTranscription`, then closes with code **1008**. That close is success. It sends `turnComplete` at every pause, so never settle on it: wait until all audio is sent, then for 5 s of nothing new. Always pass `languageHints` (`el-GR` or `en-US`).
- Audio must be 16 kHz mono PCM16, so recordings go through **ffmpeg** (`-f s16le -ac 1 -ar 16000`). No ffmpeg means the Live audio path fails over to the ordinary API.
- Models containing `live` or `transcribe` use `bidiGenerateContent` (a WebSocket protocol) and are correctly absent from the plain Gemini picker.
- **Words while I speak**: the browser streams 16 kHz PCM16 from an AudioWorklet to `/ws/live` (max payload 1 MiB). Text arrives a sentence at a time. Google ends a session at about nine minutes (seen at 540 s); the code reopens on `goAway` or close and holds the audio meanwhile. The recording is separate, so live words are never the only copy; if the careful final pass fails, the live words are kept.

## Indicators, episodes, chapters

`vocabulary.ts` holds 35 terms in four categories (`pattern` 15 "Done to me", `role` 6 "Position in the system", `response` 7 "How I survived it", `protection` 7 "What protected me"). The category is a design decision: filing something done *to* you and something you did to *survive* under one heading turns a coping response into a fault. `normalise()` checks a quote when the model gives one: case-insensitive, whitespace collapsed, and it must be found in the entry, or the term is **dropped entirely**; a found quote is cut to 400 characters. A term given with **no** quote at all is kept, without evidence. `buildPrompt()` is generated from the loaded vocabulary, so replacing it (`INDICATORS_FILE`) replaces the prompt.

`episodes.ts` proposes episodes by a deliberately blunt rule: entries on the timeline with a gap of more than `gapDays` (default 120) start a new one. Drafting renders each entry with its date, named terms and quotes; the draft is asked to cite an entry id after every claim, and a citation to an entry that was not in the set is stripped and **reported**, not hidden. The code does not check that every sentence carries a citation. `chapters.ts` drafts in parts that fit a token budget, saves each part as it lands to `vault/chapters/<id>.md`, and resumes where it stopped. The chapter id is a SHA-1 of the sorted entry ids, so the same set is the same chapter.

## Google Drive

Server-side OAuth. The server holds a **refresh token** (`access_type=offline`) and mints access tokens in memory; the browser never sees a Google credential. Scope is `drive.file`, which reaches only files the app created. Setup is a Google Cloud "Web application" client with a redirect URI ending in `/auth/callback`. Google accepts `http://localhost` or any `https` origin, but not `http://` on a private address, so `http://100.x.x.x:38726/auth/callback` is rejected: register `http://localhost:38726/auth/callback` and link once from the machine itself (or through `ssh -L 38726:localhost:38726`), or use a Tailscale HTTPS hostname.

## Desktop shell

`electron/main.cjs` is CommonJS because the package is ESM. It calls `app.getPath('userData')` and sets `VAULT_DIR=<userData>/vault`, `MYSTORY_ENV_PATH=<userData>/.env`, `HOST=127.0.0.1` and **`NODE_ENV=production`**, then `require()`s `dist/server.cjs` in-process (a child process would outlive a crashed window and hold the port). It waits up to 20 s for `/api/auth/status`. Without `NODE_ENV=production` the server starts Vite, which cannot spawn esbuild inside the asar, and the window hangs.

The window is sandboxed (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, no preload) and sends any link that is not the app to the real browser. The menu has **Open in my browser instead** and **Show my writing on disk**. `--browser` opens the same server in your own browser instead of a window. The vault and `.env` live in the user's data folder, not beside the program, so Repair and Update can replace every installed file without reaching an entry. The Windows data folder is `%APPDATA%\mystory` (the package name; `productName` is only set inside the electron-builder block).

Repair (**Check my files**) checks that the program's own files exist and are not empty. Update (**Check for an update**) calls `https://api.github.com/repos/Stravelakis/mystory/releases/latest`, compares versions, and opens the release page. It never downloads or runs anything on its own.

## Docker and servers

`Dockerfile`: Node 22 Alpine, two stages, `ENV PORT=38726 HOST=0.0.0.0 VAULT_DIR=/app/vault`, runs as the `node` user, `HEALTHCHECK` on `/api/auth/status`. `docker-compose.yml` binds `127.0.0.1:38726:38726` on purpose and bind-mounts `./vault` and `./.env`; `touch .env` first or Docker creates a directory. Inside the container the host is `host.docker.internal`. On a server, `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` skips the 100 MB Electron binary. [DEPLOY.md](https://github.com/Stravelakis/mystory/blob/HEAD/DEPLOY.md) has the systemd service and the Tailscale steps.

> **Watch out** Never publish this on port 443 of a machine that has Tailscale Funnel on. Funnel exposes the port to the whole internet. Use a separate HTTPS port (`tailscale serve --https=38726`) and check `tailscale serve status` says tailnet only.

## Tests, CI, release

`npm test` runs six Vitest files in `tests/`: `vault`, `chapters`, `providers`, `vocabulary`, `voice`, `words`. They cover the vault round trip, timeline order, chapter parts, indicator evidence and the routing and consent promises. None calls a model. CI (`ci.yml`, on push to `main` and every pull request): Node 22, `npm ci`, `lint`, `test`, `build`, plus a gitleaks scan of the whole history with the official image (not `gitleaks-action`, which needs a paid licence on organisation repos).

Release: branch, pull request, merge, tag `vX.Y.Z` on `main`, push the tag. The `v*` tag triggers `release.yml` (windows-latest, `npm run build-exe -- --publish never`, attaches the installer and the portable `.exe` to the GitHub Release) and `deploy-docs.yml` (builds this site from `docs/`). The installer is NSIS, per user, with a choosable folder, desktop and Start-menu shortcuts, and `deleteAppDataOnUninstall: false`. It is not code-signed, so SmartScreen asks.

## Gotchas

- `server.ts` is LF, most of the repo was CRLF; `.gitattributes` normalises. A multi-line string anchor can silently miss on a CRLF checkout.
- Without Windows Developer Mode, building the installer locally fails while unpacking electron-builder's `winCodeSign` cache (symlinks). CI is unaffected.
- Greek "μου είπε" has no gender; English forces one, and DeepL picks "he". That is the gender of the person who spoke to the writer, and it can be wrong.
- Google returns codes that mean something else: an invalid key is `400`, `429` can mean "slow down" or "no money", `403` can mean a restricted key or the API switched off. `explain()` in `providers.ts` rewrites them in plain English; `npm run gemini:doctor` makes one real call and says which it is.
- Attaching a Google project to Cloud billing turns the free tier **off**.
- Whisper turns silence into captions ("Υπότιτλοι AUTHORWAVE"). v1.2.0 refuses silent reading clips and warns when no sound arrives.
- Under a sandbox, `npm run dev` may have no outbound network, so provider calls fail with a bare `fetch failed`. Test provider code from a plain shell.
- **Recipes.** *Add a provider*: one entry in `resolveProviders()`; if it speaks OpenAI that is the whole change (a user who only needs a URL does not need you: `CUSTOM_BASE_URL`). *Add a job*: add to `Task` and `TASKS`, add its three keys to `CONFIG_KEYS`, call `chat({ task })`; Settings builds itself from `TASKS`. *Add an indicator term*: append to `DEFAULT_TERMS`, choosing the category by asking whether it was done to the person, a position they held, something they did, or something that protected them.
