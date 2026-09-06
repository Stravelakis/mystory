# Standards

What "done" means in this project. Short on purpose — a rule nobody reads is
not a rule.

Every one of these was written after something went wrong. The reason is given
each time, because a rule without its reason gets dropped the first time it is
inconvenient.

This project holds an account of somebody's worst years. That raises the stakes
on all of it.

---

## 1. The recording is sacred

Audio goes to disk **before** any model is called, and an entry is created to
hold it. Typed text saves itself and mirrors to `localStorage` immediately.

A failed model, an expired token, a closed tab, a dead network: each of these
may cost a convenience. None of them may cost a memory.

> **Why:** a transcription provider being down is a normal Tuesday. Losing what
> someone just managed to say out loud is not recoverable by retrying.

## 2. Never lose, never delete

**Trash** moves a file to `vault/.trash/`. Nothing in this app unlinks anything.
Entries are plain markdown with front matter, owner-readable, greppable, and
portable with `cp`. No database, nothing to migrate.

> **Why:** the person using this cannot always tell in the moment whether they
> want to keep something. That decision has to stay available to them later.

## 3. Tell the truth about what happened

If an entry saved but the tagging failed, say exactly that. If Drive sync failed
but the local write succeeded, say that. Never report a partial success as a
failure — it makes people redo work they have already done.

## 4. Plain English in anything a user reads

"Google rejected the key itself" beats `400 INVALID_ARGUMENT`.

No jargon, no error codes as the headline, no blaming the user. Assume the
reader is intelligent and has never heard the word "endpoint".

## 5. Do not guess at model names

Providers rename and retire models faster than this ships. A model id
hardcoded in our source becomes the user's 404.

Ship a **Load models** button that asks the endpoint what it has. Where a
default is unavoidable, verify it against a live account first and date the
comment.

> **Why:** the original code shipped `gemini-3.5-flash` and `gemma-4-31b` as
> hardcoded defaults. Nobody had checked whether those existed on a real key.

## 6. Verify against the real thing, not the documentation

Before shipping a provider integration, call it live and say in a comment when
you checked. Dates in comments are not decoration — they tell the next person
how stale the finding is.

Confirmed this way, all of them contradicting the obvious assumption:

- An invalid Gemini key returns **400**, not 401 or 403. (3 Sep 2026)
- Google returns **429** both for "slow down" and for "this project has no
  money". Only one of those resolves by waiting.
- Google returns **403** both for a restricted key and for the Generative
  Language API being switched off on the project. Different fixes.
- **Attaching Cloud billing to a project turns the free tier off.** Advising
  someone to add credit to fix a quota error can be exactly backwards.
- iOS Safari records `audio/mp4`; Chrome and Firefox record WebM. Hardcoding
  either one mislabels half of all recordings.
- Gemini `*-live-*` and `*-transcribe` models are **bidiGenerateContent** —
  a WebSocket protocol, not the endpoint this app speaks. They correctly do
  not appear as assignable.

## 7. Free first, and never spend without being told to

Every job must be doable on a free tier or a local model. Local endpoints and
free models are offered as equals, never as the degraded option.

A provider is only used for a job it has been **explicitly assigned**, or when
the user has assigned nothing at all and the automatic chain applies. An
aggregator with a paid key never quietly becomes the default route.

## 8. Local-only is a guarantee, not a preference

When routing is `local-only`, cloud providers are not tried, not fallen back
to, and not reachable — even with a valid key in `.env`. The Drive and Google
routes return 409 and say why.

> **Why:** a privacy setting that is merely a preference is a privacy setting
> that leaks the first time a fallback fires.

## 9. A label must be quotable

The indicator model must return an **exact substring** of the entry as evidence.
A term whose quote is not found in the text is dropped entirely, not kept with
the quote removed.

> **Why:** a stub returned `Scapegoat` with an invented quote during testing and
> it was kept. This record is meant to be one you can still trust years later,
> when you no longer remember writing it. A hallucinated citation is worse than
> a missing tag.

## 10. The vocabulary is not ours to fix

Terms are grouped by what they are *about* — done to me / position in the
system / how I survived it / what protected me. A flat list files a coping
response next to a tactic, which turns survival into a symptom.

Nothing in the app diagnoses a person. It names behaviours and dynamics.

The whole list is replaceable via `INDICATORS_FILE`, because someone else's
family did not work like yours.

## 11. Degrade, do not fail

If the first model is out of quota, use the second, then the third, and report
which answered. If tagging fails, the entry still saves. If Drive is down, the
vault still works.

A feature that stops working should get smaller, not disappear.

## 12. Comments explain why, not what

A comment restating the code is noise. A comment recording that Google returns
400 for a bad key, with the date it was confirmed, saves the next person an
afternoon.

Especially where the obvious approach was tried and failed.

## 13. The README is the front door, and it is written for strangers

Someone arrives from a search, a link, or a friend, and decides in about
fifteen seconds whether this is the thing they were looking for. The README
answers that first, before it explains anything.

Every audience gets its own file rather than a section buried in one long
page — [GUIDE](GUIDE.md) for someone who has never installed anything,
[INSTALL](INSTALL.md) for the steps, [DEPLOY](DEPLOY.md) for a box that stays
on, [HANDOFF](HANDOFF.md) for an engineer, this file for a contributor. A
single README that tries to serve all five serves none.

**Findable, in plain words.** The people who need this search for what
happened to them, not for software: "private journal app", "self-hosted",
"CPTSD", "keep my own data", "local AI". Those words belong in the opening
paragraph and the description because they are *true*, not to game anything.
A title tag, a one-line description, and honest headings are the whole SEO
budget.

> **Why:** the first README opened with the architecture. Somebody looking for
> a private place to write would have closed the tab.

## 14. Movement means something, or it does not happen

Animation is feedback, not decoration. It exists to say: this saved, this is
listening, this arrived, this is the same object you were just looking at.

- Nothing animates on a timer or on its own.
- Nothing animates for longer than it takes to notice — roughly 200ms.
- `prefers-reduced-motion` removes all of it. Deco Noir already honours that;
  anything added has to honour it too.
- The recording indicator is the exception that proves the rule: it moves
  continuously because it is reporting a live state, and stopping would be a
  lie.

> **Why:** this app is used by people whose nervous systems are already doing
> too much. A page that shimmers at somebody mid-sentence is not neutral.

## 15. Settings must be able to repair themselves

Any setting a person can get wrong needs a way to see that it is wrong and a
way to put it right, from inside the app.

- Every provider key has a **Test** that says working or says why not.
- Model lists are loaded from the provider, never typed from memory.
- There is a place to see what is configured, what is reachable, and what
  version is running.
- A broken value is reported in plain words, never as a status code.
- Nothing destructive is a single click away from something ordinary.

> **Why:** a key that silently does not work costs an afternoon and reads like
> the app being broken. Twice now that is exactly what happened.

## 16. The look is a setting, not a build-time decision

Deco Noir ships with colourways and a dress. Which one is in use belongs to
the person using it, and survives a restart.

Appearance is not cosmetic here. Someone writing about the worst years of
their life at two in the morning should be able to turn the contrast down
without editing a file.

---

## Before you open a pull request

```bash
npm run lint     # tsc --noEmit, no errors
npm run build    # it builds
```

If you changed a user-facing message, the wording **is** the feature — treat it
as an interface change. If you learned something about a provider, put it in a
comment with the date and add it to §6 above.
