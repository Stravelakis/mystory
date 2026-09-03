# 🕯 My Story, explained simply

This is the friendly version. No jargon. If you have never installed anything
before, you can still get through this.

---

## Part 1 · What even is this thing?

It is a **diary that listens**.

You press a button and talk, or you type. It writes down what you said, keeps
it in a plain file on your own computer, and — because remembering in order is
hard — it can later read everything back and help you shape it into chapters.

It also does one more thing, quietly. When something you describe matches a
pattern that has a name — being told a thing never happened, being made the one
who causes all the trouble, going flat and agreeable to make it stop — it puts
that name beside your words, **with the exact sentence you wrote that it came
from**.

Not to diagnose anybody. So that a thing you have been carrying without a name
gets one, and so that later, when you doubt yourself, you can see the sentence
as well as the label.

### Who it is for

Someone who wants a record of their own life that they control completely, and
who is tired of trusting an app company with it.

### Who it is not for

It is not a therapist. It is not a crisis service. It does not tell you what to
do, and it never speaks unless you press the button that asks it to. If you are
in danger or in crisis, please reach a person.

---

## Part 2 · Getting it running (once)

Full steps with screenshots-worth of detail are in **[INSTALL.md](INSTALL.md)**.
The very short version:

1. Install **Node.js** from <https://nodejs.org> (take the LTS one).
2. Download this project and unzip it.
3. Open a terminal in that folder and type `npm install`, then `npm run dev`.
4. Open **<http://localhost:4747>** in your browser.

Then two settings, both important:

- **A passcode**, under Settings → The lock. Write it down.
- **A model**, under Settings → Models. Either one running on your own computer
  (free, private) or a key from a free cloud tier.

---

## Part 3 · Writing your first entry

Open the **Vault** tab.

- **Type** into the big panel, and it saves itself a few seconds after you stop.
- Or press **RECORD**, talk, press it again. It writes down what you said.

Two buttons you never have to press:

- **GIVE ME YOUR OPINION** — a short, steady, validating response.
- **PROMPT ME FOR MORE** — a gentle question if you have gone quiet.

They only ever run when you press them. Nothing responds to you unasked.

> **On your phone?** Recording needs an `https` address. Part 8 covers it.

---

## Part 4 · Where do my entries go? (important!)

Into a folder called **`vault`**, inside the project folder.

```
vault/
  20260816-142530-a3f.md      ← one entry. Open it in Notepad. It's just text.
  audio/                      ← the actual recordings
  .trash/                     ← things you trashed. Still here.
```

Three things worth knowing:

1. **They are ordinary text files.** If this app vanished tomorrow, you would
   still have every word, readable in anything.
2. **To back up, copy the `vault` folder.** That is the whole procedure. Do it
   to a USB stick or another drive. There is no other copy unless you make one.
3. **Nothing here deletes.** "Trash" moves a file to `.trash/`. If you change
   your mind next year, it is still there.

---

## Part 5 · The names it puts on things

When you write about something, the app may add a tag with a short explanation
under it, and a quote from your own writing showing why.

They come in four groups, deliberately kept apart:

| Group | Means | Examples |
|---|---|---|
| **Done to me** | something another person did | gaslighting, DARVO, hoovering, smear campaign |
| **Position in the system** | a part you were cast in | scapegoat, golden child, flying monkeys |
| **How I survived it** | what *you* did to get through | fawn, gray rock, freeze, hypervigilance |
| **What protected me** | what actually worked | a boundary held, an exit, a witness |

**Why four groups and not one list?** Because "gaslighting" is something done to
you and "fawn" is something you did to survive it, and putting them under one
heading makes the second look like a fault. It is not a fault. It is what
worked at the time.

If the app cannot find the exact sentence that justifies a tag, it **drops the
tag**. A label you cannot check is worth nothing, and this record is meant to
be one you can still trust in ten years.

Don't agree with the words it uses? They are not fixed. See Part 8.

---

## Part 6 · Free, keys, and money

Three ways to run the thinking part:

| | Costs | Privacy |
|---|---|---|
| **On your own computer** (Ollama) | nothing, ever | nothing leaves the machine |
| **A free cloud tier** (Google AI Studio, Groq) | nothing, with daily limits | your text goes to that company |
| **A paid key** | what you choose | your text goes to that company |

There is a switch for this: **Settings → Models → Where models run**.

Set it to **Local only** and the app will not contact any cloud company at all
— it will refuse to, even if a key is sitting in its settings, and it also
switches Google Drive off. That is a promise the code keeps, not a preference
it tries to honour.

Each of the five jobs (transcribing, naming patterns, the companion, titles,
chapter drafting) can be given its own model, plus **two backups** in case the
first is out of quota. Cheap and fast for the constant jobs; save the big slow
one for drafting chapters.

**Never type a model name you read somewhere.** Press **Load models** and pick
from the list — that list is what your key can genuinely use today.

---

## Part 7 · "It's stuck!"

| Problem | Fix |
|---|---|
| RECORD does nothing | The browser is blocking the microphone. Use `localhost` on the computer itself, or the Tailscale `https` address on a phone. |
| "No model is set up for this job" | Settings → Models. Paste a key or add a local endpoint, press **Load models**, assign one. |
| Google key won't work | In the terminal: `npm run gemini:doctor`. It explains which of the usual four causes it is. |
| Transcription failed | **Your recording is safe.** It was written to disk before anything was sent anywhere. Try again, or pick a different engine. |
| Forgot the passcode | Open `.env`, delete the `APP_PASSCODE_HASH=` line, save, restart. Entries untouched. |
| It's very slow | A local model with no graphics card is slow. Give the small jobs a small model. |

---

## Part 8 · Grown-up extras (optional)

- **Your phone.** Install Tailscale on both machines, run
  `sudo tailscale serve --bg 4747`, open the `https://…ts.net` address on the
  phone, then **Add to Home Screen**. See [DEPLOY.md](DEPLOY.md).
- **Always on.** [DEPLOY.md](DEPLOY.md) has a copy-paste setup for a mini PC
  that starts on boot and survives power cuts.
- **Google Drive.** Optional mirror of your entries into your own Drive.
  Entirely off under Local-only.
- **Your own vocabulary.** Point `INDICATORS_FILE` at a JSON file of your own
  terms and definitions, and none of the built-in ones apply any more. Someone
  else's family did not work like yours.
- **Stop keeping recordings.** Set `VAULT_KEEP_AUDIO=off`.
- **Put the vault elsewhere.** Set `VAULT_DIR` to any folder — an encrypted
  drive, for instance.

---

## The whole thing on one page

1. `npm install`, `npm run dev`, open `localhost:4747`.
2. Set a passcode. **Write it down.**
3. Give it a model. **Load models**, then assign.
4. Talk or type. It saves itself.
5. **Copy the `vault` folder somewhere safe.** Regularly.
6. Nothing is deleted, nothing is sent unless you said so, and the recording
   always survives.
