# 🔐 Installing My Story on your own computer

This app keeps a private journal on **your** machine. Nobody hosts it for you.
That is the point, and it is why there are a few steps.

Take them in order. Nothing here can break your computer.

---

## STEP 1 — Get the files

Download the project as a ZIP from the GitHub page (green **Code** button →
**Download ZIP**) and unzip it somewhere you can find again — your Documents
folder is fine.

Or, if you have `git`:

```bash
git clone https://github.com/Stravelakis/mystory.git
```

## STEP 2 — Install Node.js

This is the engine the app runs on. One download, one installer.

👉 <https://nodejs.org> — take the **LTS** version.

Click through the installer with all the defaults. To check it worked, open a
terminal (Windows: **PowerShell**; Mac: **Terminal**) and type:

```bash
node --version
```

Anything starting `v20` or higher is good.

## STEP 3 — Press play

In the terminal, go to the folder you unzipped, then:

```bash
npm install
npm run dev
```

The first line takes a minute or two — it is fetching the parts. The second one
starts the app and prints something like:

```
My Story running on http://0.0.0.0:3000
Vault: /home/you/mystory/vault
Models: cloud-first — none configured
```

Now open **<http://localhost:3000>** in your browser.

To stop it, press **Ctrl + C** in the terminal. To start it again, `npm run dev`.

---

## STEP 4 — Two things to do immediately

### Set the lock 🔒

**Settings → The lock →** type a passcode → **Set passcode**.

Until you do this, anyone who can reach your computer on the network can read
every entry, and the app will keep telling you so.

⚠️ **Write the passcode down somewhere.** It is stored as a one-way hash, which
means it genuinely cannot be recovered. Losing it does not lose your writing
(see *Where your writing lives* below) but it does mean editing a file to get
back in.

### Give it a model 🧠

The app records and saves perfectly well with no model at all — it just cannot
*transcribe* or *draft* until it has one. Pick whichever suits you:

**A. Free, and nothing leaves your computer.** Install
[Ollama](https://ollama.com), then:

```bash
ollama pull llama3.1:8b
```

In **Settings → Models**: set *Where models run* to **Local only**, put
`http://localhost:11434/v1` as the Local models endpoint, press **Load models**,
and assign what appears to each job.

**B. Free-ish, in the cloud.** Get a key from
[Google AI Studio](https://aistudio.google.com/apikey) (free tier, no card) or
[Groq](https://console.groq.com/keys). Paste it into
**Settings → Models → Provider keys**, press **Load models**, assign.

Not sure your Google key is working? There is a tool for exactly that:

```bash
npm run gemini:doctor
```

It tells you, in plain English, which models that key can actually use and what
to fix if it cannot.

---

## 📁 Where your writing lives

In a folder called `vault/` inside the project:

```
vault/
  20260816-142530-a3f.md        one entry — open it in any text editor
  audio/                        the original recordings
  .trash/                       things you trashed. Still there.
```

They are ordinary text files. **Back them up by copying that folder.** That is
the entire backup procedure. Nothing in the app ever deletes anything —
"Trash" moves a file into `.trash/`.

If you ever lose the passcode: open `.env` in a text editor, delete the line
starting `APP_PASSCODE_HASH=`, save, restart. Your entries are untouched.

---

## 📱 Using it from your phone

Recording needs a microphone, and browsers refuse the microphone unless the
page is on `https` (or on the computer itself). So this needs one extra piece:

1. Install [Tailscale](https://tailscale.com) — free for personal use — on the
   computer running the app **and** on your phone. Sign into the same account.
2. On the computer: `sudo tailscale serve --bg 3000`
3. On your phone, open the `https://…ts.net` address Tailscale gives you.
4. **Share → Add to Home Screen.** It gets its own icon and opens full screen.

Nothing is published to the internet by this — that address only works for your
own devices. Full instructions in [DEPLOY.md](DEPLOY.md).

---

## 🖥️ Leaving it running all the time

If you have a mini PC or a spare machine, [DEPLOY.md](DEPLOY.md) has a
copy-paste setup that starts the app on boot and survives power cuts.

## 🐳 Or with Docker

If you already use Docker, this is the whole thing:

```bash
touch .env && mkdir -p vault && docker compose up -d
```

---

## 🆘 It won't start

| What you see | What it means |
|---|---|
| `npm: command not found` | Node.js is not installed — back to Step 2. |
| `EADDRINUSE` / port 3000 in use | Something else is on that port. `PORT=3001 npm run dev`. |
| Page loads but **RECORD** does nothing | The browser is refusing the microphone. Use `http://localhost:3000` on the machine itself, or the Tailscale `https` address from your phone. Not an embedded preview pane. |
| "No model is set up for this job" | Step 4B. Press **Load models** after pasting a key. |
| Google key rejected | `npm run gemini:doctor` — it will say which of the four usual causes it is. |
| Everything is slow | A local model on a machine with no GPU is genuinely slow. Assign a small model to *Indicators* and *Titles*, and keep the big one for *Synthesis*. |

Still stuck: open an issue at
<https://github.com/Stravelakis/mystory/issues> and paste what the terminal
printed. The terminal output is the useful part.
