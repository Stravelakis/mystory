# Letting an agent drive My Story

The app is an HTTP server on your own machine. There is no separate agent
protocol to learn: anything that can make a request — Claude Code, a script,
`curl` — can read your entries, add one, tag it, place it in time, or draft a
chapter.

That is deliberate. The vault is plain files and the app is a plain API, so if
this project stopped being maintained tomorrow you would still have both.

> **Before you point an agent at this.** These entries are the most sensitive
> thing you own. An agent with this base URL can read all of them. Give it the
> address of a vault you are willing to have it read, and nothing else.

---

## What the agent needs

The base URL, and the passcode if you have set one.

```
http://localhost:4747
```

If a passcode is set, unlock once and keep the cookie:

```bash
curl -c jar.txt -X POST http://localhost:4747/api/auth/unlock \
  -H 'Content-Type: application/json' \
  -d '{"passcode":"your passcode"}'

curl -b jar.txt http://localhost:4747/api/vault/entries
```

Every `/api` route needs that cookie. Without a passcode nothing does, which is
also why the app keeps telling you to set one.

---

## The routes worth knowing

### Reading

| | |
|---|---|
| `GET /api/vault/entries` | every entry, newest **happened** first |
| `GET /api/vault/entries/:id` | one entry, with its text, quotes and dates |
| `GET /api/vault/info` | where the vault is, how many entries, whether audio is kept |
| `GET /api/vocabulary` | the terms this app can name, with definitions |
| `GET /api/providers` | what is configured and reachable; `?load=1` asks each provider for its model list |

### Writing

```bash
curl -X POST http://localhost:4747/api/vault/entries \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "The move",
    "text": "We moved in 2011. She told me it never happened.",
    "occurred": { "text": "2011", "start": "2011", "end": "2011", "confidence": "stated" }
  }'
```

Every field is optional except one of `text` or `drive`. An existing entry is
updated by passing its `id`, and **any field you leave out is kept** — so an
agent adding a translation cannot accidentally blank the dates.

### Asking the models

| | |
|---|---|
| `POST /api/journal/analyze-tags` | `{transcript}` → named patterns, each with an exact quote from the text |
| `POST /api/journal/when` | `{text}` → roughly when it happened, or an honest "unknown" |
| `POST /api/journal/translate` | `{text, id?}` → English beside the original |
| `POST /api/journal/autotitle` | `{transcript}` → a few words |
| `POST /api/journal/transcribe-audio` | multipart `audio` → a transcript |
| `POST /api/episodes/draft` | `{ids[], focus?, explainTerms?}` → a chapter, every claim cited |
| `GET /api/episodes/propose` | candidate episodes, grouped by gaps in time |

### Checking it works

| | |
|---|---|
| `POST /api/providers/check` | `{id}` → is this provider's key working, and how many models can it reach |
| `POST /api/providers/test` | `{task}` → make one real call for that job and report which model answered |

---

## Claude Code

Point it at the folder and it can read the source as well as the API. To let it
drive the running app, the base URL is all it needs.

For **images** — icons, banners, diagrams — this project uses
[Image Forge](https://github.com/Stravelakis/image-forge), which speaks MCP.
Drop a `.mcp.json` beside this file:

```json
{
  "mcpServers": {
    "image-forge": {
      "command": "node",
      "args": ["/path/to/image-forge/scripts/mcp-server.js"]
    }
  }
}
```

Then ask for the pictures in words. That file is gitignored here, because the
path is particular to your machine.

---

## Two things an agent should not do

**Do not write `indicators` by hand.** A named pattern is only meaningful with
the words it came from, and `POST /api/journal/analyze-tags` enforces that: a
term whose quote is not found in the entry is dropped. Setting labels directly
skips the check and puts an unbacked claim in your record.

**Do not fill in `occurred.text` with a guess.** That field is the writer's own
words, quoted exactly. The range (`start`/`end`) is where an inference belongs,
and `confidence` says what kind of inference it was. Getting this backwards
turns somebody's uncertainty into a false memory with a date on it.

---

## If it stops working

- `GET /api/auth/status` — is it up, is it locked, are you signed in
- `npm run gemini:doctor` — what a Google key can actually do
- The terminal it is running in prints which model answered each job

Nothing here writes outside `vault/` and `.env`.
