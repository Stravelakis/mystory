## English

My Story is a journal that lives on your own computer. You talk or type, and it keeps what you said in ordinary text files in a folder you choose. Nobody hosts it for you and there is nothing to sign up for.

### What it does

- **Writes down what you say.** Press Record and speak in Greek or English. You can keep your exact words, or a tidied version with the "um"s taken out. The exact words are always kept in the file either way.
- **Translates, without replacing.** Greek entries get an English version beside them. The original is never changed.
- **Puts things in order.** You can say when something happened in your own words ("the year my brother left"). It works out a rough date range, so entries line up in the order they happened, not the order you wrote them.
- **Names what happened.** As you write, it spots patterns such as gaslighting, DARVO, scapegoating or the golden child, and responses such as fawning or gray rock. Each one comes with a short explanation and the exact sentence of yours it was found in. If it can't point to your words, it doesn't show the label.
- **Helps you write the book.** It groups entries into episodes by time and drafts each one as a chapter. Every sentence is marked with the entry it came from, so you can check it.

### Where your words go

This is the part to understand before you start.

- If you use **cloud AI** (Google Gemini, Groq, Mistral and others), what you wrote or said is sent to that company to be processed. On free tiers, that company may use it to improve its products. The app won't use any cloud service until you tick **"I understand where my words go"** in Settings.
- If you use **local AI** (a model running on your own computer), nothing leaves the machine. Set routing to **Local only** and the app refuses cloud services even when keys are saved.

### Getting it

- **Windows:** download the installer from the latest release and run it. It installs like any app and has a normal uninstaller. Your entries and settings stay behind when you uninstall.
- **Anything else:** install Node.js 20, then follow INSTALL.md. It also runs in Docker, or on a small home server that you open from your phone over Tailscale.

### Keeping it safe

Set a passcode first (Settings → The lock). Your entries are plain files, so you can back them up by copying the folder. Settings → Advanced has **Repair**, which checks the app's own files, and **Update**, which installs the newest release. Neither one touches your entries.

This is a journal, not a therapist. It describes behaviours and gives them their common names. It doesn't diagnose anyone. If you are in crisis, please reach out to a person.
