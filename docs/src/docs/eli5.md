---
checkedAgainst: v1.2.0
checkedOn: 2026-11-21
---

## Start here

This page takes you from "I have never installed anything like this" to "I wrote my first entry and I know exactly where it is". Go slowly. Nothing here can break your computer, and every step says what you should see, so you always know whether it worked.

This is a journal. It can hold personal, even painful, things, so one promise first: **you are in charge.** You decide what to write, what to keep and what to show anyone. You can stop at any step and come back another day.

> **Do this first** You do not need to understand everything before you begin. Read **The ideas** (about ten minutes), then follow the steps. Come back to the rest when you want it.

**What you will have at the end:**

- My Story installed on your Windows computer.
- A passcode, so other people cannot open your journal.
- Your first entry, and the exact folder where its file sits.
- A spare copy of your writing.
- A clear picture of what stays on your computer and what can leave it, and a switch that is yours.

**What you do not need:** an account, a credit card, or any knowledge of code. You need a Windows computer and the internet for the first download.

**How long:** about 30 minutes, most of it waiting for the installer and the first words to appear.

> **Watch out** My Story is a journal, not a doctor, a lawyer or a therapist. It gives names to things that happened and shows you your own sentences beside them. It does not tell you what is true, what to do, or what is wrong with anyone. If you are in danger or in crisis, please contact someone you trust or your local emergency or crisis service.

## The ideas

Take them one at a time. Nothing here is a test.

### 1. A diary that listens

My Story is a program on your computer. You type, or you press a button and talk, and it writes down what you said. That written piece is called an **entry**.

### 2. "Self-hosted" means it lives with you

Most apps live on a company's computers, and you borrow them. This one is the other way round. It runs **on your own computer**, and the company that made it never sees your entries, because they never leave unless you tell them to. Nobody "hosts" it for you. That is what **self-hosted** means.

### 3. Your writing is just files in a folder

A **file** is one thing saved on your computer, like a letter in an envelope. A **folder** is a box that holds files. Every entry you write becomes one ordinary text file with a name like `20260816-142530-a3f.md`. The first part is the date and time. You can open it in Notepad. If the app disappeared tomorrow, your words would still be there, readable.

The folder that holds all your entries is called the **vault**.

### 4. Nothing is ever really deleted

When you press **Trash** on an entry, the app does not destroy it. It moves the file into a folder called `.trash` inside the vault. If you change your mind next year, it is still there.

### 5. A passcode keeps other people out

A **passcode** is a secret word you choose, like a PIN. After you set one, the app asks for it before it shows any entry. The app saves it in a scrambled form that cannot be turned back into your word. That is very safe, but it also means **nobody can recover it for you**. Write it down somewhere private.

Forgetting it does not lose your writing, because your entries are plain files. It just takes one small fix to get back in (the fixes are further down).

### 6. A model is the thinking part

To turn your voice into words, give an entry a title, or spot patterns, the app asks a **model**. A model is a program that has learned from a huge amount of text and can do jobs like these. The app has six jobs it can ask models to do: **transcribing** (voice into words), **naming patterns**, a **companion** reply, working out **when it happened**, writing **titles**, and drafting **chapters**.

### 7. Cloud or your own computer

A model can live in two places:

- **On your own computer.** Free, and your words never leave. It needs a bit more setup and a computer that can handle it.
- **In the cloud**, which means on a company's computers far away. Easier, and some have a free allowance. But **your words travel to that company** to be handled, under their rules. Free tiers may let the company use or read what you send.

Neither is wrong. The app makes you choose on purpose.

### 8. A key is a password for a service

Cloud companies want to know who is asking. They give you a long secret code called an **API key**. Think of a library card: whoever holds it can borrow in your name, so you keep it private. My Story keeps your keys on your own computer and sends each one only to the company it belongs to.

### 9. Your words only leave if you say so

There is a box in Settings that says **I understand where my words go**. It starts **unticked**. While it is unticked, the app only asks models on your own computer, and it refuses to translate or show live words, because those use the cloud. Ticking it is a choice only you make. You can untick it any time.

### 10. Names for things that happened

When what you write matches a pattern that people have a name for, like being told something never happened ("gaslighting"), the app can put that name beside your words, with a short plain explanation and **the exact words you wrote that it came from**. These names are not diagnoses and not verdicts. They are labels you can check against your own words. If the app is given words to back a name up and they are not in your entry, it throws the name away.

> **In short** You talk or type. The app saves it as a file in a folder on your computer. It only asks a cloud company for help if you tick a box. Nothing is deleted. A passcode keeps other people out.

## Step 1: Download it

1. Open your web browser (Chrome, Edge, Firefox, any of them).
2. Go to the [downloads page](https://github.com/Stravelakis/mystory/releases/latest). This is a page on **GitHub**, a website where programmers keep their projects. It is the official home of My Story.
3. Scroll to the part called **Assets**.
4. Click the file that starts with **My Story Setup** and ends with **.exe**. The numbers in the middle are the version.
5. Wait for it to download.

**What you should see:** the file appears in your browser's download list, usually in your **Downloads** folder.

<details>
<summary>I do not want to install anything</summary>

The same page has a **portable** file called `my-story-portable-` followed by a version number, ending in `.exe`. Double-click it and the app runs from wherever the file is, with no installer.

</details>

## Step 2: Install it

1. Find the file you downloaded and double-click it.
2. Windows may show a **blue box** that says **"Windows protected your PC"**. Do not worry. Read the next box.
3. Click **More info**. A new button appears.
4. Click **Run anyway**.
5. The installer lets you choose where to put the app. The suggested place is fine. Click through to the end.

> **Why** Windows shows the blue box for any program from a publisher it does not know yet, because the maker has not bought a paid "this is really me" stamp (called code signing). It does not mean something is wrong. You only do this once. The project is open source, so anyone can read the code on GitHub.

**What you should see:** a **My Story** shortcut on your desktop and in the Start menu. The app also appears in Windows **Settings → Apps**, where you can uninstall it later.

## Step 3: Open it and look around

Double-click the **My Story** shortcut.

**What you should see:** a window opens with a dark, gold-edged look. At the top are three tabs: **Vault**, **Synthesis** and **Settings**. The page is called **Silent Vault**. There is a big writing box that says *"Press RECORD to speak, or simply begin writing here…"*. A small tag near the top says **Vault Protected**.

- **Vault** is where you write and record.
- **Synthesis** is where you later read everything back and turn entries into chapters.
- **Settings** is where you choose the lock, the models and what is allowed to leave.

> **Try it** Click the three tabs and look. Nothing you click here changes anything yet.

## Step 4: Set your passcode

Do this before you write anything.

1. Click **Settings**.
2. Scroll to the box called **The lock**.
3. You will see a note that says **No passcode is set.** Under it, find the field *Set a passcode*.
4. Type a passcode you will remember. It needs **at least four characters**.
5. Click **Set passcode**.
6. **Write the passcode on paper** and keep it somewhere private.

**What you should see:** the note changes to a green tag that says **Locked**, with the words *A passcode is required to open the vault.* From now on, opening the app shows a **Locked** screen and an **Unlock** button. Type your passcode and press **Unlock**.

> **Why** The app runs a small web page on your own computer. Without a passcode, anyone who could reach that page could read your entries. Setting one now means you never have to worry about it later. Five wrong guesses in a row make the app ignore that address for one minute.

## Step 5: Look at where your words go

Still in **Settings**, scroll to the box called **Where your words go**.

**What you should see:** a short explanation, and a tick box that says **I understand where my words go, and I want cloud providers to be used.** It should be **unticked**.

**Leave it unticked for now.** You can decide after you have read the rest of this page.

## Step 6: Give the app a model

The app can save everything without a model. It just cannot turn your voice into words, suggest names, or draft chapters until it has one. You have two choices.

**Choice A: a free cloud allowance (easiest to start).** Remember: your words travel to the company, so you will also tick the box from Step 5.

1. Open [aistudio.google.com/apikey](https://aistudio.google.com/apikey) in your browser. This is Google's page for keys; the My Story install guide says the free tier needs no card. Follow the page to make a key and **copy** the long code.
2. In My Story, open **Settings**. Scroll to **Provider keys**.
3. Paste the code into the field called **Google Gemini**.
4. Click **Test** under it.
5. Tick **I understand where my words go** (Step 5) only if you are happy with that.
6. Scroll to **Models** and click **Load models**.
7. Scroll to **Which model does which job**. For each of the six jobs, choose a model from the drop-down. You can click **Try it** on a job to see if it answers.
8. Click **Save all**.

**What you should see:** after **Test**, a short line saying whether the key works. After **Load models**, the drop-downs fill with real model names. After **Save all**, the button says *Saving…* and the "changes are not kept" note goes away.

> **Watch out** **Save all** really matters. Settings are not kept until you press it.

> **Why** You pick the models from a list that the app asks the company for right then. You never type a model name from memory, because names change and a wrong one gives an error.

**Choice B: everything on your own computer.** Free and fully private, but it needs a second program that runs a model, such as LocalAI or Ollama, and a computer that can handle it. In **Settings → Models**, set **Where models run** to **Local only**, put the program's address in **Local models**, press **Load models** and pick. The **English** level of this page has the addresses. If this sounds like too much today, do Choice A or skip to Step 7. You can come back.

<details>
<summary>What do the three "Where models run" choices mean?</summary>

**Cloud first:** the app asks cloud companies first and your own computer as a backup. **Local first:** your own computer first, the cloud only when it cannot answer. **Local only:** the cloud is never asked, even if a key is saved, and Google Drive is switched off. The app keeps this promise in its code, not just in the screen.

</details>

## Step 7: Write your first entry

1. Click **Vault**.
2. Click in the big box and type a few sentences. They can be about anything small: your morning, a place you like.
3. Stop typing and wait a few seconds.

**What you should see:** a green tag near the top changes to **Saved** followed by the time. The entry is now a file in your vault. You did not press Save: it saved itself.

If you chose a model, the **Indicators** area next to the box may fill in with named patterns. It stays empty if nothing in your words matches one. That is normal.

> **Try it** Find the box called **When did this happen?** Type it in your own words, like *"around when we moved"*, or press **Work it out for me**. A rough answer is a good answer. Entries are put in order by when things happened, not when you typed them.

## Step 8: Try talking

1. In the **Session** panel, find **Spoken language** and choose **Greek** or **English**. The app does not guess, because guessing wrong ruins a whole transcript.
2. Press **Record**. If Windows or the app asks to use your microphone, allow it.
3. Say a couple of sentences.
4. Press **Stop**.

**What you should see:** the button turns into **Stop** while you record, and after you stop, your words appear in the box. If you have not set up a model, nothing is written yet, but **your recording is safe**, saved before anything else happens.

> **Why** The recording is sent to your vault in small 5-second pieces as you talk. If the computer crashes, you lose seconds, not the whole thing. The next time you open the app it offers **Recover it**.

## Step 9: Find your file

Your writing is a real file. Seeing it makes the whole idea click.

1. Go to **Settings**.
2. Find the box called **The vault**. It shows **Location**, **Entries** and **Recordings kept**.
3. Copy the path shown under **Location**. In the Windows app it should end in `vault`.
4. Open **File Explorer**, paste the path into the address bar at the top, and press Enter.

**What you should see:** a folder with files that end in `.md`, a folder called `audio` if you recorded something, and maybe a hidden folder called `.trash`. Double-click a `.md` file. Notepad can open it. You will see your words, with a few lines at the top that hold the date and title.

## Step 10: Make a spare copy

1. Open the vault folder from Step 9.
2. Select everything inside it (press **Ctrl+A**).
3. Copy it (**Ctrl+C**) and paste (**Ctrl+V**) into a folder on a USB stick or another drive.

**What you should see:** the same files in the new place. That is your backup. There is no database and nothing else to save.

> **Watch out** Your vault is **not scrambled** on the disk. Your passcode keeps people out of the app, but anyone who can open your computer's files can read the folder. Windows can encrypt the whole disk (it is called BitLocker on some editions). That is the tool for that job.

## Step 11: Decide about the cloud box

Now that you know what the box does, it is yours to decide.

- **Unticked:** your words stay on your computer. Cloud models are not asked. Translation to English and live words are switched off.
- **Ticked:** the app may send what you write or say to the company whose model does the job. That is how voice-to-text and chapter drafting work with a cloud model.

You can change it any time under **Settings → Where your words go**. Press **Save all** afterwards.

> **In short** Cloud off means private but you need your own model. Cloud on means easier but your words travel. The app never decides for you.

## If something goes wrong

Everything here is fixable, and none of it touches your writing.

<details>
<summary>I see the blue "Windows protected your PC" box</summary>

That is expected. Click **More info**, then **Run anyway**. See Step 2.

</details>

<details>
<summary>I forgot my passcode</summary>

Your entries are safe. You need to open one settings file. The file is called `.env`. In the Windows app it is in the folder `%APPDATA%\mystory` (paste that into the File Explorer address bar). Open it in Notepad, delete the whole line that starts with `APP_PASSCODE_HASH=`, save, and restart the app. It opens without a passcode, and you can set a new one.

</details>

<details>
<summary>Record does nothing</summary>

The microphone is probably blocked. Check that Windows allows apps to use the microphone, and that the right microphone is chosen in the **Session** panel under **Microphone**.

</details>

<details>
<summary>It says "No model is set up for this job"</summary>

The app has no model yet. Do Step 6: paste a key or add a local address, press **Load models**, choose a model for the job, and press **Save all**.

</details>

<details>
<summary>It says "Cloud AI is not switched on yet"</summary>

You asked for something that needs a cloud company, and the box is unticked. Either tick **I understand where my words go** (Step 5), or use a model on your own computer.

</details>

<details>
<summary>My Greek names or family words come out wrong</summary>

Teach it. In **Settings**, find **My words** and add names, places and words the app cannot know. **Help me build my list** walks you through it, and **Find words in my entries** suggests words that really appear in your writing.

</details>

<details>
<summary>Transcription failed</summary>

Your recording is safe. It is saved before anything is sent anywhere. Try again, or choose a different model for **Transcription** in **Which model does which job**. On any entry with a recording, **Transcribe again** runs it through your current settings. The earlier text is copied into `.trash` first.

</details>

<details>
<summary>It is very slow</summary>

A model running on a computer without a graphics card is slow. Give small models to the quick jobs (**Indicators** and **Titles**) and keep the big one for **Synthesis**.

</details>

<details>
<summary>The app seems broken</summary>

In **Settings**, find **Advanced** and press **Check my files**. It checks that the program's own files are all there. It never touches your writing, because your vault and settings live in a separate folder.

</details>

If you are still stuck, tell the makers on [GitHub](https://github.com/Stravelakis/mystory/issues). Say what you did, what you expected and what you saw.

## A small dictionary

| Word | What it means |
|---|---|
| **Entry** | One piece of writing or speech you saved |
| **Vault** | The folder that holds all your entries |
| **File / folder** | A saved thing / a box that holds saved things |
| **Passcode** | A secret word you choose that locks the app |
| **Self-hosted** | It runs on your own computer, not a company's |
| **Model** | A program that does a job like turning voice into words |
| **Cloud / local** | On a company's computers / on your own |
| **API key** | A secret code that lets a program use a company's service |
| **Transcribe** | Turn speech into written words |
| **Indicator** | A named pattern the app finds in your words, with your sentence as proof |
| **Trash** | A folder where "deleted" entries go, still safe |
| **Backup** | A spare copy of your vault, kept somewhere else |
| **Installer** | A helper that puts a program on your computer |

## What next?

- **Talk without the clutter:** on the **Vault** tab, **Start a session** gives you one button and a quiet screen. **Pause** whenever you need to, and **I'm done** to finish.
- **Put your life in order:** on **Synthesis**, **Find my episodes** groups entries by when they happened, and **Draft this episode** writes a chapter in which the app asks for each claim to name the entry it came from. A name for an entry that was not used is removed.
- **Use it on your phone:** that needs one extra step called Tailscale. The **English** level explains it.
- **Curious how it works inside?** Switch to **Dev** in the left menu.

## Uninstall (the clean way)

Open Windows **Settings → Apps**, find **My Story**, and choose **Uninstall**. The installer is set **not** to remove your writing: your entries and settings stay in `%APPDATA%\mystory`. If you want them gone as well, delete that folder yourself, after making a backup (Step 10).
