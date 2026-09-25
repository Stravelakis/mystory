# ⚒ My Story — Engineering Handoff

Everything a fresh session needs. Written 3 Sep 2026.

---

## 1. Orientation (60 seconds)

A single-user, single-machine journal. You speak or type; it transcribes, names
patterns in what you said, and later drafts entries into chapters. No accounts,
no multi-tenancy, no server of ours. The person running it owns the box.

**The vault is the product.** Plain markdown files on disk. Everything else —
models, Drive, the interface — is replaceable around them.

```bash
npm install
npm run dev        # Express + Vite middleware, :38726
npm run lint       # tsc --noEmit
npm run build      # client → dist/, server → dist/server.cjs
npm run gemini:doctor   # what a Google key can actually do
```

Read [STANDARDS.md](STANDARDS.md) before changing anything. It is short, and
every rule in it exists because something broke.

---

## 2. Architecture at a glance

```
index.html ──► src/main.tsx ──► src/App.tsx        one file, three surfaces
                                     │              (Vault / Synthesis / Settings)
                                     ▼ fetch /api
                                 server.ts          Express, one process
                     ┌───────────────┼───────────────┐
                     ▼               ▼               ▼
                 vault.ts      providers.ts      google.ts
                 (disk)        (models)          (Drive/OAuth)
                     │               │
              vocabulary.ts     env.ts / auth.ts
              (the terms)       (.env, passcode, sessions)
```

There is no database, no ORM, no state manager, and no build step for the
server beyond esbuild bundling it.

## 3. Module map

| File | Owns | Note |
|---|---|---|
| `server.ts` | every route, the companion WebSocket | ~700 lines; routes only, logic lives in the modules |
| `providers.ts` | **all** model access | the only file that talks to a model |
| `vocabulary.ts` | the indicator terms, the tagging prompt, evidence validation | replaceable at runtime via `INDICATORS_FILE` |
| `vault.ts` | read/write/trash entries, audio containers | atomic writes: temp file + rename |
| `env.ts` | `.env` read/merge/write, the `CONFIG_KEYS` allow-list | never serialises `process.env` to disk |
| `auth.ts` | scrypt passcode, signed session cookies, throttling | one passcode, no users |
| `google.ts` | OAuth, refresh token, Drive/Docs | server holds the token; browser never sees a Google credential |
| `src/App.tsx` | the entire interface | ~2000 lines, deliberately one file |
| `src/styles/deco-noir.css` | the identity | **vendored, not depended on** — do not npm-install it |
| `src/styles/mobile.css` | phone-only concerns + the responsive splits | loaded after the identity so it can only adjust it |

## 4. providers.ts — the part that matters

Two shapes of provider, and only two:

- **`openai`** — a `/v1` endpoint. Groq, Mistral, Cerebras, NVIDIA, OpenRouter,
  any custom gateway, **and every local runtime** (Ollama, LM Studio,
  llama.cpp, vLLM) and every local Whisper server. One driver.
- **`gemini`** — Google's SDK, which is its own shape and always will be.

**A local model is not a special case.** It is a provider whose `baseUrl`
happens to be on your network and whose `local` flag is true. This collapsed
four hand-rolled fallback chains into one router; do not reintroduce a branch
for "local".

### Six jobs

`transcribe`, `when`, `indicators`, `companion`, `title`, `synthesis`. Each takes a
first choice and two fallbacks, stored as `MODEL_<TASK>_1/_2/_3` in `.env`,
each `"<providerId>::<model>"`.

`chat()` resolution order:
1. a model pinned for this single run (the Synthesis picker)
2. the assigned slots for the task, in order
3. if nothing is assigned, the automatic chain from `chainFor()`

Every failure is recorded and stepped over. The thrown error leads with the
**first** failure, because that is the one the user chose first.

### Routing

`cloud-first` / `local-first` / `local-only`. Under `local-only`, `chainFor()`
returns only local providers **and** middleware in `server.ts` closes
`/api/google`, `/api/drive` and `/auth/callback` with a 409. Both halves are
required — see STANDARDS §8.

### Model names

`listModels()` asks the endpoint. For `gemini` that is the REST
`v1beta/models` listing, filtered to `generateContent`; for everything else
`GET {base}/v1/models`. `probe(config, deep)` — `deep` is the **Load models**
button. All plain GETs, no generation cost.

Do not add a hardcoded model id without calling it live and dating the comment.

## 5. Data model

An entry is a markdown file with front matter:

```
vault/20260816-142530-a3f.md
vault/audio/20260816-142530-a3f.m4a      (or .webm, .ogg — whatever arrived)
vault/.trash/…
```

```yaml
---
id: 20260816-142530-a3f
title: …
created: …            # ISO, never rewritten
updated: …
indicators: Gaslighting, Fawn      # labels only, see sharp edges
audio: audio/20260816-142530-a3f.m4a
drive: https://…      # written back after a successful archive
---
```

`saveEntry` is write-through: an existing entry keeps every field the caller
does not set, so archiving can record a link without touching the text.

## 6. The order of operations (do not rearrange)

1. audio → disk, entry created to hold it
2. transcription attempted
3. text → entry
4. **only then** Drive

Rearranging this trades a durable recording for a convenience. STANDARDS §1.

## 7. Audio containers

iOS Safari records `audio/mp4`; Chrome and Firefox record WebM. The client
negotiates with `MediaRecorder.isTypeSupported`, sends the real type, and
`vault.ts` stores the matching extension. `findAudio(id)` resolves by prefix
because older entries are all `.webm` with no extension recorded.

Never hardcode a container. Half your users are on the other one.

## 8. Indicator evidence

`vocabulary.ts:normalise()` requires the model's `evidence` to be an exact
substring of the entry (whitespace-normalised). A term whose quote is **not**
found is dropped entirely — not kept with the quote stripped. STANDARDS §9.

`buildPrompt()` is generated from the loaded vocabulary, so replacing the terms
replaces the prompt with them.

## 9. Known sharp edges

- **`server.ts` is LF, most of the repo was CRLF.** `.gitattributes` normalises
  now. Multi-line string anchors will silently miss on a CRLF checkout.
- **`src/App.tsx` is one 2000-line file.** Splitting it is fine; splitting it
  while also changing behaviour is not.
- **Gemini `*-live-*` / `*-transcribe` are `bidiGenerateContent`** — WebSocket,
  not implemented, correctly absent from the pickers.
- **The vault is not encrypted at rest.** The passcode keeps people off the
  port. Full-disk encryption is the answer to the other threat, and the README
  says so rather than implying more.
- **`npm run dev` under a sandbox may have no outbound network**, so provider
  calls fail with a bare `fetch failed`. Test provider code from a plain shell.

## 10. Recipes

**Add a provider** → one entry in `resolveProviders()`. If it speaks OpenAI,
that is the whole change. If a user just needs a URL, they do not need you:
`CUSTOM_BASE_URL` already exists.

**Add a job** → add to `Task` and `TASKS` in `providers.ts`, add its three keys
to `CONFIG_KEYS` in `env.ts`, call `chat({task})`. The Settings panel builds
itself from `TASKS`.

**Add an indicator term** → append to `DEFAULT_TERMS`. Pick the category by
asking whether it was *done to* the person, a *position* they held, something
*they did*, or something that *protected* them.

**Change a user-facing message** → the wording is the feature.

## 11. The Live API (live.ts)

Everyday jobs go to Gemini's streaming Live API first. None of it behaves
like the ordinary API, and every quirk below cost a failed test to find
(25 Sep 2026):

| Model | Job | What it actually does |
|---|---|---|
| `gemini-3.8-live-extended-thinking` | all text jobs | **speaks** its answer; we read Google's transcript of the speech. Needs a thinking level. Without the "silent function" system instruction it chats instead of answering. |
| `gemini-3.5-transcribe-live` | transcription | returns the transcript as `inputTranscription`, then closes 1008 — that close is success |
| `gemini-3.5-live-translate-preview` | translating recordings | speech in, speech out. Ignores text. **Drops the final sentence every time** in testing, so a sentence-count guard rejects it and DeepL takes over |
| `gemini-3.8-live` | — | audio-only, cannot do text jobs at all |

- Each Live session carries ~2,600 tokens of Google's own preamble.
- Audio must be 16 kHz mono PCM, so recordings go through **ffmpeg**. Without
  ffmpeg the Live audio path fails over to the ordinary API.
- A job with a required shape passes `validate` to `chat()`; an answer that
  fails it moves on to the next model instead of becoming "nothing found".

Fallbacks: `gemini-3.5-flash-lite`, then `gemma-4-31b-it`.
