# My Story

**A private vault for recording your own life, in your own words, on hardware you own.**

Speak or write into the Vault. The recording is transcribed, named, and kept as
a plain markdown file on your disk. Patterns worth naming — what was done to
you, the position you were put in, how you survived it, what protected you —
are named beside the entry, with the words they were drawn from. When there is
enough of an archive to work with, Synthesis reads the entries back and drafts
them into chapters.

It runs on one machine that you own. There is no account, no server of ours,
and nothing to sign up for. Nobody hosts this for you, including us.

> **This is a journal, not a clinician.** It names behaviours and dynamics —
> things that happened, and what they are commonly called. It does not
> diagnose anyone, and it is not a substitute for care from a person.

---

## Install

**Requirements:** Node.js 20 or newer.

```bash
git clone https://github.com/Stravelakis/mystory.git
cd mystory
npm install
npm run dev
```

Open <http://localhost:4747>.

Or, with Docker:

```bash
touch .env && mkdir -p vault && docker compose up -d
```

Either way, do these two things first:

1. **Settings → The lock.** Set a passcode. Until you do, anyone who can reach
   the port can read every entry, and the app says so on every screen and in
   the boot log.
2. **Settings → Models.** Point it at a model. Nothing works until you do —
   though nothing is lost either: recordings are written to disk before any
   model is called.

For an always-on box and access from a phone, see [DEPLOY.md](DEPLOY.md).

---

## Where the models run

Every model is reached through an OpenAI-compatible endpoint, so a model
running on your own machine and a model running in someone else's datacentre
are configured the same way and are equally first-class.

| Routing | |
|---|---|
| **Cloud first** | cloud providers are asked first, a local runtime is the fallback |
| **Local first** | your own machine first, cloud only when it cannot answer |
| **Local only** | nothing leaves this machine — cloud providers are never asked, and Google Drive is refused while it is set |

**Local only is a guarantee, not a preference.** With it on, the cloud
providers are not tried, not fallen back to, and not reachable even with a key
sitting in `.env`, and the routes that would put an entry into Google Drive are
closed and say why.

### Running it entirely on your own machine

Two pieces, both optional, both replaceable:

```bash
# Models — Ollama is the least trouble
ollama serve
ollama pull llama3.1:8b

# Transcription — anything with an OpenAI-compatible /v1/audio/transcriptions
docker run -d -p 8000:8000 ghcr.io/speaches-ai/speaches:latest-cpu
```

Then in **Settings → Models**:

| | |
|---|---|
| Where models run | `Local only` |
| Local models → Endpoint | `http://localhost:11434/v1` |
| Local models → Model | `llama3.1:8b` |
| Local transcription → Endpoint | `http://localhost:8000/v1` |
| Local transcription → Model | `Systran/faster-whisper-large-v3` |

The Settings screen lists what each endpoint actually has installed, so you can
check rather than guess. Anything speaking the same protocol works in their
place — LM Studio, llama.cpp's server, vLLM, LocalAI, whisper.cpp,
faster-whisper-server.

Inside Docker, the host is `host.docker.internal` rather than `localhost`.

### Which model does which job

Five jobs, each with a first choice and two fallbacks. If the first cannot
answer — out of quota, retired, switched off — the second is tried, then the
third, and the app reports which one answered.

| Job | Wants |
|---|---|
| **Transcription** | accuracy; the one job whose quality you feel immediately |
| **Indicators** | fast and cheap — it runs while you type |
| **Companion** | warmth; only ever runs when you press the button |
| **Titles** | the smallest job here |
| **Synthesis** | the one job worth a slow, expensive model |

**Model names are never guessed.** Press **Load models** in Settings and the app
asks every provider what it actually has — a plain listing that costs nothing.
Providers rename and retire models faster than any app ships, so a name copied
from a blog post is tomorrow's 404.

### Cloud providers

None are required and none are hardcoded into a feature: **Gemini**, **Groq**,
**Mistral**, **NVIDIA NIM**, **Cerebras**, **OpenRouter**, or any other
OpenAI-compatible endpoint you paste a URL for. Keys are written to `.env`
beside the app and are sent nowhere except to the provider they belong to.

An aggregator with a paid key is **opt-in only** — it is never used for a job
you have not explicitly assigned it to.

### If a Google key will not work

```bash
npm run gemini:doctor
```

It lists exactly which models that key can use, makes one real call, and
explains any failure in plain English. Worth knowing before you start guessing:

- an **invalid key** comes back as `400`, not `401` — so it reads like a
  malformed request when it is really a bad key
- `429` means both "slow down" and "this project has no money", and only one
  of those resolves by waiting
- `403` means both "the key is restricted" and "the Generative Language API is
  switched off on this project"

And the one that catches everybody: **attaching a project to Cloud billing turns
the free tier off.** If you want free-tier usage, use a key from a project with
no billing account. If you want to spend credit, the credit has to sit on the
billing account that project is linked to.

Gemini model names containing `live` or `transcribe` use a different protocol
(`bidiGenerateContent`, a streaming WebSocket) which this app does not speak.
They will not appear as assignable even when your key has them. That is correct,
not a bug.

---

## Where your writing lives

**This machine is the vault.** Entries are plain markdown with front matter in
`vault/`, owner-readable only and ignored by git:

```
vault/
  20260816-142530-a3f.md      one entry, readable by anything
  audio/20260816-142530-a3f.webm
  .trash/                     trashed entries land here
```

The order of operations is deliberate:

1. A recording is written to `vault/audio/` **before** any model is called, in
   whatever container the device produced, and an entry is created to hold it.
   If every transcription provider is down or unconfigured, you still have the
   recording.
2. Typed entries save themselves a few seconds after you stop typing, and are
   mirrored into `localStorage` immediately so a reload cannot cost you a
   half-written paragraph.
3. Only then is anything sent to Google Drive, and the link is recorded back
   onto the local entry. A failed or expired Drive token costs you a sync,
   never a memory.

Nothing in the app deletes anything: **Trash** moves the file into
`vault/.trash/`. Point `VAULT_DIR` somewhere else to relocate the vault, or set
`VAULT_KEEP_AUDIO=off` to stop retaining recordings.

Back it up by copying the folder. There is no database and nothing to migrate.

---

## The lock

There is no account system — one passcode, set under **Settings → The lock**.

- every `/api` route and the companion WebSocket require a session
- the session is a signed cookie, `HttpOnly`, good for 30 days, and survives a
  restart
- the passcode is stored **only** as a scrypt hash in `.env`. It cannot be read
  back out, which also means there is no recovery — write it down
- five wrong guesses from one address buys a minute of silence

Losing the passcode does not lose your writing: the entries are plain files.
Delete `APP_PASSCODE_HASH` from `.env` and restart to unlock. **The vault is
not encrypted at rest** — the passcode keeps other people off the port, and
full-disk encryption is what keeps them out of the folder.

---

## The vocabulary

The terms the app is allowed to put on your writing live in
[`vocabulary.ts`](vocabulary.ts), grouped by what they are *about*:

| | |
|---|---|
| **Done to me** | gaslighting, DARVO, hoovering, triangulation, smear campaign… |
| **Position in the system** | scapegoat, golden child, flying monkeys, lost child… |
| **How I survived it** | fawn, gray rock, freeze, hypervigilance, dissociation… |
| **What protected me** | boundary held, no contact, exit, witness, documentation… |

A flat list would make a category error. "Gaslighting" is something done to
you; "fawn" is something you did to survive it; "scapegoat" is a position you
were put in. Filing all three under one heading turns a coping response into a
symptom.

Every term carries a plain definition, shown beside the tag, and the model is
required to quote the words it drew the term from — a term it cannot quote for
is dropped. Someone else's family did not work like yours, so the whole list is
replaceable: point `INDICATORS_FILE` at a JSON file of your own and none of
these terms apply to you any more.

---

## Google Drive

Optional, off under local-only routing, and never required. Nothing is uploaded
until you archive an entry.

The server holds a **refresh token** and mints access tokens as it needs them;
the browser never receives a Google credential. Scope is `drive.file` — access
to files this app creates, and nothing else in your Drive.

Setting it up is a one-time job in the
[Google Cloud console](https://console.cloud.google.com/apis/credentials):

1. Create an OAuth client, type **Web application**.
2. Add an authorised redirect URI ending in `/auth/callback`.
3. Paste the client ID and secret into **Settings → Google account**, save,
   then **Link**.

**On the redirect URI:** Google accepts `http://localhost` or any `https`
origin, but not `http://` on a private address — so
`http://100.x.x.x:4747/auth/callback` is rejected. Either register
`http://localhost:4747/auth/callback` and link once from a browser on the
machine itself (or through `ssh -L 4747:localhost:4747`), or put the app behind
a Tailscale HTTPS hostname and register that. The link survives restarts.

---

## On a phone

The interface is responsive and installable — **Add to Home Screen** gives it
its own icon, full screen, and no address bar in the way of a recording.

**Recording from a phone needs https.** Browsers do not grant the microphone on
a plain `http://` origin that is not localhost, so a Tailscale HTTPS hostname
is the practical route in. [DEPLOY.md](DEPLOY.md) has the three commands.

Safari on iOS records MP4 where Chrome and Firefox record WebM; the app asks
the device what it can produce and carries that through, so recordings from a
phone are stored and transcribed in whatever container they actually arrived
in.

---

## Scripts

| | |
|---|---|
| `npm run dev` | Express + Vite middleware, port 4747 |
| `npm run build` | client into `dist/`, server into `dist/server.cjs` |
| `npm start` | run the built server |
| `npm run lint` | `tsc --noEmit` |

## Look

The interface is **Deco Noir** — art-deco geometry under a noir key light. It
is vendored, not depended on: [`src/styles/deco-noir.css`](src/styles/deco-noir.css)
and `deco-noir.js` are copies, and the identity survives without the script.

- colourway `oxblood`, dress `full` — set on `<html>` in `index.html`
- Tailwind is loaded **without** Preflight and is used for layout only; every
  colour comes from a Deco Noir token
- the signature is a chamfer on two opposing corners, top-left and
  bottom-right. If you add a component, it gets `.cut` / `.cut-sm` too
- [`src/styles/mobile.css`](src/styles/mobile.css) holds the phone-only
  concerns and is loaded after the identity, so it can only ever adjust it

## Documentation

| | For |
|---|---|
| [GUIDE.md](GUIDE.md) | never installed anything before — the friendly version |
| [INSTALL.md](INSTALL.md) | step by step, including what goes wrong |
| [DEPLOY.md](DEPLOY.md) | an always-on box, and reaching it from a phone |
| [HANDOFF.md](HANDOFF.md) | working on the code |
| [STANDARDS.md](STANDARDS.md) | contributing — what "done" means, and why |

## Licence

[Apache 2.0](LICENSE), with attribution required on redistribution — see
[NOTICE](NOTICE), which explains in plain English what you must keep and when
it applies. Short version: run it, change it, keep it. If you pass it on, the
credit travels with it.
