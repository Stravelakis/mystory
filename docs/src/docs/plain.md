## What My Story is

A journal that lives on **your own computer**. You talk or type; it keeps what you said in ordinary text files in a folder you can open yourself. Nobody hosts it for you, and there is nothing to sign up for.

On top of that it can do four things, only when you let it:

- **Write down what you say.** Press Record and speak in Greek or English.
- **Translate beside the original.** A Greek entry gets an English version under it. The original is never changed.
- **Put things in order.** Entries carry *when the thing happened*, in your own words ("the summer before I left school"), not just when you typed them.
- **Name what happened.** When your words match a pattern that has a name (gaslighting, scapegoat, fawn, gray rock and others), it puts the name beside your words, with the exact sentence it came from. A name it cannot quote you for is dropped.

> **Watch out** This is a journal, not a clinician. It names behaviours; it does not diagnose anyone, it never speaks unless you press a button that asks it to, and it is not a substitute for a person. If you are in crisis, please reach one.

This page describes version **1.2.0**. Later work that is not released yet is not covered.

## Install it

You have two ways. Pick the first unless you already use a terminal.

**Windows app (easiest).**

1. Open the [latest release](https://github.com/Stravelakis/mystory/releases/latest) and download **My Story Setup x.y.z.exe** (a portable `.exe` is there too).
2. Run it. Windows shows a blue **Windows protected your PC** box, because the app is not signed with a paid certificate yet. Click **More info**, then **Run anyway**. You only do this once.
3. It installs for your user only, adds a Start-menu entry and a desktop shortcut, and lists itself under **Installed apps**.

Your entries and settings live in `%APPDATA%\mystory` and **stay there if you uninstall**. In the app, **Settings → The vault** shows the exact folder (**Location**) and how many entries it holds, and the menu **My Story → Show my writing on disk** opens it for you.

**From source, on anything with Node.js 20 or newer.**

```bash
git clone https://github.com/Stravelakis/mystory.git
cd mystory
npm install
npm run dev
```

Open <http://localhost:38726>. To stop, press Ctrl+C in the terminal. On Windows, `npm run shortcut` puts a **My Story** icon on your Desktop that starts the app and opens your browser. With Docker: `touch .env && mkdir -p vault && docker compose up -d`.

> **Do this first** Three settings, in this order: **Settings → The lock** (a passcode), **Settings → Where your words go** (leave unticked unless you want cloud AI), **Settings → Models** (point it at a model). Nothing is lost if you skip the last one: recordings are saved before any model is called.

## Set up the lock and the models

1. **The lock.** Type a passcode of at least four characters and press **Set passcode**. Until you do, anyone who can reach the app's port can read every entry, and the app tells you so. The passcode is stored only as a one-way scrypt hash, so it cannot be recovered. **Write it down.** Five wrong guesses from one address buy a minute of silence.
2. **Where your words go.** Tick **I understand where my words go** only if you want cloud AI. Until it is ticked, no entry text is sent to any cloud provider (DeepL included) and only models on your own machine are asked.
3. **Models → Where models run.** Three choices: **Cloud first**, **Local first**, **Local only**.
4. Paste a key under **Provider keys** (a free Google Gemini key from AI Studio, or Groq, Mistral, NVIDIA, Cerebras, OpenRouter, or any endpoint that speaks the OpenAI format) or point **Local models** at a runtime on your machine. Press **Load models**. The app asks every provider what it really has, which costs nothing, so you never type a model name from memory.
5. **Which model does which job.** Six jobs: **Transcription**, **Indicators**, **Companion**, **When it happened**, **Titles**, **Synthesis**. Each takes a first choice and two fallbacks. If the first is out of quota or switched off, the second is tried, then the third, and the app tells you which one answered. Press **Try it** on a job to test it, then **Save all**.

> **Why** Cheap and fast models suit the constant jobs (Indicators runs while you type). Save the slow, strong one for Synthesis, which drafts chapters.

**Running it entirely on your own machine.** Set **Where models run** to **Local only**. LocalAI does chat and transcription from one endpoint (`http://localhost:8080/v1`). Ollama (`http://localhost:11434/v1`) has no transcription, so it needs a Whisper server beside it (for example `http://localhost:8000/v1`). LM Studio, llama.cpp and vLLM work the same way. Inside Docker the machine is `host.docker.internal`, not `localhost`.

## Your first entry

Open the **Vault** tab.

1. Type into the big box, or press **Record**, speak, and press **Stop**. A typed entry saves itself a few seconds after you stop typing.
2. In the **Session** panel, set **Spoken language** to Greek or English. There is no auto-detect, because guessing wrong ruins a whole transcript. Choose **Tidied** (fillers and false starts removed) or **Word for word** under *How to write it down*. Your exact words are kept in the file either way.
3. **When did this happen?** Type it in your own words, or press **Work it out for me**. A rough answer is a good answer.
4. **Indicators** fill in as you write: each named pattern with its definition and the sentence it came from.
5. **In English** shows the translation beside the original.

Two buttons run only when you press them: **Give me your opinion** (a short, steady response) and **Prompt me for more** (a gentle question). Nothing answers you unasked.

Nothing in the app deletes anything. **Trash** moves an entry and its recording into the vault's `.trash` folder, where it stays.

## Talking without thinking about the tech

**Start a session** gives you one button and a quiet screen. **Pause** whenever you need to: it is still one recording and the pause is not transcribed. **I'm done** ends it. The space bar pauses and carries on. Words can appear as you speak (**Words while I speak**, a Google cloud feature, so it needs your consent tick and a Gemini key) or you can hide them.

The recording is sent to your vault in 5-second pieces as you talk. A crash, a closed tab or a flat battery costs seconds. Next time you open the app it offers **Recover it**. **Transcribe again** (on any entry with a recording) runs it through today's settings; the old text is copied into `.trash` first.

## Help it understand you

In order of effort:

1. **Say the language.** Spoken language: Greek or English.
2. **Use a decent microphone, untouched.** Pick it under **Microphone**. For a USB or studio mic, set **Sound cleanup** to **Off**, so the browser's phone-call filters do not squash quiet speech. The level bar shows it hears you.
3. **My words** (Settings): names, what you call people at home, places. **Help me build my list** walks you through it; **Find words in my entries** only suggests words that really appear in your writing.
4. **Your voice** (Settings): read calm sentences aloud one at a time. **Measure** ranks every engine you have by how many of your words it got wrong, and **Use the best three** sets them in that order.
5. **Train it.** The `training/` folder fine-tunes Whisper on your recordings. It needs a graphics card with about 8 GB and half an hour or more of reading. It is a separate step and is not run by the app.

## Where your writing lives

In a folder called `vault`: beside the app when you run from source, `%APPDATA%\mystory\vault` in the Windows app.

```
vault/
  20260816-142530-a3f.md      one entry, readable in Notepad
  audio/…                     the recordings
  .trash/                     things you trashed
```

**Back up by copying the folder.** There is no database and nothing to migrate. Set `VAULT_DIR` to put it somewhere else (an encrypted drive, say) and `VAULT_KEEP_AUDIO=off` to stop keeping recordings.

> **Watch out** The vault is **not encrypted** on disk. The passcode keeps other people off the app's port; full-disk encryption (BitLocker, FileVault) is what keeps them out of the folder.

## The names it puts on things

Four groups, kept apart on purpose:

| Group | Means | Examples |
|---|---|---|
| **Done to me** | something another person did | gaslighting, DARVO, hoovering, smear campaign |
| **Position in the system** | a part you were cast in | scapegoat, golden child, flying monkeys |
| **How I survived it** | what *you* did to get through | fawn, gray rock, freeze, hypervigilance |
| **What protected me** | what worked | a boundary held, no contact, a witness |

Gaslighting is something done to you; fawn is something you did to survive it. One list would make the second look like a fault. It is not. If the app cannot find the exact sentence that justifies a name, it drops the name. You can replace the whole list: point `INDICATORS_FILE` at a JSON file of your own terms.

## Episodes and chapters

**Synthesis** reads your entries back. **Find my episodes** groups entries by when they happened (a gap of more than about four months starts a new group). **Draft this episode** writes a chapter where every claim names the entry it came from, and a citation to an entry that was not in the set is removed and reported. Long chapters are drafted in parts, each saved as it finishes, so a failure costs one part, never the rest.

## Where your words go

Plainly, from the code:

- **Nothing is sent to a cloud AI or to DeepL until you tick "I understand where my words go".** Until then only models on your own machine are asked, and translation and live words refuse to run.
- **Local only** closes the cloud model providers, even with a key sitting in the settings, and switches **Google Drive** off.
- **Google Drive** is optional and off by default. Nothing is uploaded until you archive an entry. The app holds a refresh token and asks only for access to files it creates (`drive.file`); the browser never receives a Google credential.
- Keys are stored in the settings file (`.env`) and sent only to the provider they belong to. The Settings screen can set a key but never read it back.
- **Check for an update** asks GitHub for the latest release when you press it. It sends no entry text and installs nothing by itself.

> **Watch out** One gap in version 1.2.0: if you tick the consent box, add a DeepL key **and** set Local only, translation still goes to DeepL, because DeepL is checked against the consent box only. For the strictest setup, leave the consent box unticked.

Free cloud tiers (Google, Groq and others) may let the company use or read what you send. That is why the box is unticked by default.

## Your phone, and leaving it on

The interface is responsive and can be added to the Home Screen. **Recording from a phone needs https**: browsers refuse the microphone on a plain `http://` address that is not the computer itself. The practical route is Tailscale:

1. Install [Tailscale](https://tailscale.com) on the computer running the app and on the phone, signed into the same account.
2. On the computer: `sudo tailscale serve --bg 38726`.
3. On the phone, open the `https://…ts.net` address Tailscale gives you, then **Share → Add to Home Screen**.

That address works only for your own devices. [DEPLOY.md](https://github.com/Stravelakis/mystory/blob/HEAD/DEPLOY.md) has a copy-paste setup for a mini PC that starts on boot. Never serve it on port 443 of a machine that has Tailscale Funnel on: Funnel makes the port public.

## When something is wrong

- **Port 38726 is already in use.** Another copy of the app, or another project. Start it elsewhere: `PORT=38730 npm run dev`.
- **Record does nothing.** The browser is blocking the microphone. Use `http://localhost:38726` on the computer itself, or the Tailscale https address on a phone. Not an embedded preview pane.
- **"No model is set up for this job".** Settings → Models: add a key or a local endpoint, press **Load models**, assign one.
- **"Cloud AI is not switched on yet".** Tick the box under **Where your words go**, or use a local model.
- **A Google key will not work.** Run `npm run gemini:doctor`. An invalid key shows as `400`, `429` means both "slow down" and "this project has no money", and attaching a project to Cloud billing turns the free tier off.
- **Transcription failed.** Your recording is safe: it is written before anything is sent anywhere. Try again, or pick another engine, then **Transcribe again**.
- **Forgot the passcode.** Open the `.env` settings file, delete the line starting `APP_PASSCODE_HASH=`, save, restart. Your entries are untouched.
- **A local model finds no indicators.** It is the hardest job. The app says whether the model ran out of room or returned only its thinking. A non-reasoning model usually does better.
- **Everything is slow.** A local model without a graphics card is slow. Give small models to Indicators and Titles and keep the big one for Synthesis.
- **The app seems broken.** **Settings → Check and repair → Check my files** checks the program's own files. It never touches your writing.

Still stuck? Open an issue at [github.com/Stravelakis/mystory/issues](https://github.com/Stravelakis/mystory/issues) and paste what the terminal printed.

## Setting it up with an agent

If you use the Claude Chrome extension, [README.md](https://github.com/Stravelakis/mystory/blob/HEAD/README.md) has a ready-made prompt that walks it through Settings safely: it never types or reads a key, leaves masked fields alone, and stops instead of improvising. Transcription is the one thing it cannot check, because it needs real speech.
