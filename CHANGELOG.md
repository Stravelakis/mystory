# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
