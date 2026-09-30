# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-09-30

Focused on one thing: the app understanding the person speaking.

### Added
- `training/`: fine-tunes Whisper large-v3-turbo on your Your voice clips (LoRA, fits an 8 GB card). It measures before and after on held-back sentences, and serves the result as a local transcription endpoint on port 40666.
- **Start a session** (Vault): a quiet full-screen view for talking without the rest of the app. It has one button to begin, **Pause** (still one recording, and pauses aren't timed or transcribed), **I'm done**, and the option to hide the words. The space bar pauses and carries on.
- The screen stays awake while recording, so a phone doesn't lock mid-sentence and cut the microphone.
- **Your voice** (Settings): a reading session that teaches the app how you sound. It prepares calm, everyday sentences with your own names and places in them, and you read them one at a time on a full-screen view (the space bar starts and finishes each one). Each clip is saved with its text in `vault/voice/`. **Measure** then runs your clips through every engine you have and ranks them by how many words each got wrong, and **Use the best three** sets them in that order.
- **Words while you speak** (Session → Words while I speak, on by default). The microphone streams to Gemini Live and each sentence appears a few seconds after you say it. Google ends a Live session after about 9 minutes; it reconnects on its own in a fraction of a second, holding the audio meanwhile. When you stop, the full recording still gets the careful pass. If that pass fails, the live words are kept.
- **The recording is saved while you speak**, in 5-second pieces. A crash, a closed tab or a flat battery costs seconds, not the session. Next time, the vault offers **Recover it**.
- **My words** (Settings): names, places and family words the transcriber can't know, saved as `vault/words.md`. The list is given to every transcription, and the tidying pass may correct a misheard word to one on the list. To help build it: four guided prompts, one-tap therapy terms, and **Find words in my entries**, which only suggests words that really appear in your entries.
- **Transcribe again** on any entry with a recording: it runs through today's transcriber with your word list. The previous text is copied to `.trash` first.
- **Microphone** and **Sound cleanup** settings in the Session panel, plus a live level meter. With cleanup Off, a good USB microphone reaches the transcriber untouched, without the browser's phone-call filters.
- The vault page's panels can be rearranged. **Arrange panels** lets you drag a panel by its grip (touch works too), move it with the arrows, or send it to the other column. **Reset layout** undoes it all. The layout is remembered in each browser, so your phone and desktop can differ.

### Fixed
- Whisper engines transcribed Greek speech as English. The hint sent with each recording was an English sentence, and Whisper follows the hint's language. It's now only the word list. The voice measurement caught this.
- **Long recordings were lost.** Uploads were capped at 10 MB, about 10–20 minutes of speech. A longer session was refused and never reached the vault. Recordings are now made at 64 kbps (about 0.5 MB a minute), and the cap is 400 MB.
- **Live transcription stopped at the first pause.** Everything said after the first pause in a recording was thrown away. Now it listens to the end, however long the pauses are. It is also told the language, which it wasn't before.
- Transcript sentences no longer run together ("word.Word").

### Changed
- The browser's own speech recognition is gone. It didn't work in the desktop app, and in Chrome it sent your voice to Google without asking. Words while you speak replaces it and respects the consent setting.
- Spoken language is Greek or English, with no Auto-detect. Greek is the default, and the choice is remembered.

## [1.1.0] - 2026-09-25

### Added
- A test suite: `npm test` (vitest), run in CI. It covers the vault round trip, timeline order, chapter parts, indicator evidence, and the routing and consent promises.
- Long chapters are drafted in parts that each fit one model call. Each part is saved to `vault/chapters/` as soon as it finishes. If a part fails, the parts before it are kept, and **Continue** (or **Finish drafting**) picks up at the missing part. Saved chapters are listed in Synthesis → Episodes.

### Fixed
- Reading an entry returned its text with a trailing newline that was not saved.

## [1.0.0] - 2026-09-25

First public release.

### Added
- Record in Greek or English and get a transcript, either tidied or word for word. Your exact words are always kept in the file.
- Entries are plain markdown files, written atomically. Trash is a folder, and nothing is ever deleted.
- "When did this happen?": your own words plus an estimated date range, so the timeline follows when things happened rather than when you wrote them.
- Indicators: 35 named patterns in four groups, each with a plain definition and the exact sentence it was found in. A label that can't be quoted is dropped.
- Greek entries get an English version beside the original, through DeepL or a language model.
- Episodes: entries grouped by time and drafted into chapters. Every sentence cites its entry, and made-up citations are removed.
- A model router for six jobs, each with a first choice and two fallbacks. It works with Gemini (including the Live API), Groq, Mistral, Cerebras, NVIDIA, OpenRouter, OmniRoute, any OpenAI-compatible endpoint, and local runtimes.
- Local-only routing that is enforced: cloud providers and Google Drive are refused.
- A cloud consent gate: no cloud provider is used until you tick "I understand where my words go".
- A Windows desktop app (Electron) with an NSIS installer, a portable build and browser mode. Your data lives in %APPDATA% and survives an uninstall.
- Settings → Advanced: Repair and Update (GitHub Releases).
- A passcode lock (scrypt), a Test button for each key, Load models, and "Try it" for each job.
- A docs site with Dev, English and ELI5 reading levels.
- A gitleaks pre-commit hook and a private-address check.

### Security
- The web font is self-hosted, so no page load contacts Google.
- Git history was scrubbed of an early leaked key, and gitleaks now reports it clean.

### Known gaps
- No test suite yet. CI runs typecheck and build only.
