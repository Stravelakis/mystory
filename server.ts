/* =============================================================================
   SERVER — every route, in one process.

   Deliberately thin. This file decides what a request means and what to say
   back; it does not decide how to reach a model, how an entry is stored, or
   what a term means. Those live in providers.ts, vault.ts and vocabulary.ts,
   and each of them is usable without this file.

   Two ordering rules hold the interesting parts together:

     - A recording reaches disk BEFORE any model is called, and an entry is
       created to hold it. Everything after that point may fail without
       costing the recording.
     - Drive is last, always. A sync can fail; a memory may not.

   Local-only routing is enforced here as well as in providers.ts: the
   middleware below closes the Google and Drive routes outright. A privacy
   setting honoured in only one of the two places is one fallback away from
   leaking.
   ========================================================================== */

import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import multer from 'multer';
import {
  ensureVault,
  listEntries,
  readEntry,
  saveEntry,
  trashEntry,
  saveAudio,
  findAudio,
  newId,
  isValidId,
  VAULT_DIR,
  KEEP_AUDIO,
} from './vault.ts';
import {
  SESSION_COOKIE,
  hashPasscode,
  verifyPasscode,
  signSession,
  verifySession,
  newSecret,
  parseCookies,
  sessionCookie,
  clearCookie,
  throttled,
  recordFailure,
  recordSuccess,
} from './auth.ts';

import {
  CONFIG_KEYS,
  SECRET_KEYS,
  PASSCODE_KEY,
  SECRET_KEY,
  loadConfig,
  saveConfig,
  setEnvKey,
} from './env.ts';
import * as google from './google.ts';
import { NotConnected } from './google.ts';
import {
  chat,
  transcribe,
  probe,
  readRouting,
  isLocalOnly,
  synthesisChoices,
  slotsFor,
  tidyTranscript,
  resolveProviders,
  listModels,
  TASKS,
  type Task,
} from './providers.ts';
import { buildPrompt, normalise, loadTerms, CATEGORIES } from './vocabulary.ts';
import { translate } from './translate.ts';
import { draftEpisode, proposeEpisodes } from './episodes.ts';
import { repair, checkUpdate } from './maintenance.ts';
import { timelineKey } from './vault.ts';

dotenv.config();

// 38726, not 3000. Port 3000 is the busiest number in local development —
// Image Forge's dev server sits on it with strictPort, so whichever of the two
// started second simply died. 38726 also avoids 3001, 4000, 5000, 5173, 8000,
// 8080 and 9000, so somebody else's machine is unlikely to collide either.
const PORT = Number(process.env.PORT) || 38726;
// 0.0.0.0 means every interface, which on a machine that is also on your home
// LAN is more than the tailnet. Set HOST to the Tailscale address to publish
// there and nowhere else.
// Empty means "every interface, both address families". Node binds :: in
// dual-stack mode when no host is given, which accepts IPv4 and IPv6 alike.
//
// It used to default to '0.0.0.0', which is IPv4 only. On Windows, localhost
// resolves to ::1 before 127.0.0.1, so http://localhost:38726 hit a refused
// IPv6 socket. Browsers retry the other family and appeared to work; anything
// stricter — a health check, curl -6, a script — simply failed. Confirmed on
// this machine 5 Sep 2026: [::1]:38726 actively refused while 127.0.0.1:38726
// answered 200.
const HOST = process.env.HOST || '';

/** The redirect Google will send the consent response back to. Google only
 *  accepts https origins or localhost, so on a headless box this is normally
 *  left at the default and the account is linked once from that machine. */
function redirectUri(req: any): string {
  return process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/callback`;
}

// Fetch Google Drive / Docs content
async function fetchFileContent(accessToken: string, fileId: string, mimeType: string): Promise<string> {
  try {
    if (mimeType === 'application/vnd.google-apps.document') {
      const res = await fetch(`https://docs.googleapis.com/v1/documents/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Docs API returned status ${res.status}: ${errorText}`);
      }
      const data = await res.json();
      
      let text = "";
      if (data.body && data.body.content) {
        for (const element of data.body.content) {
          if (element.paragraph && element.paragraph.elements) {
            for (const el of element.paragraph.elements) {
              if (el.textRun && el.textRun.content) {
                text += el.textRun.content;
              }
            }
          }
        }
      }
      return text;
    } else {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        throw new Error(`Drive alt=media response status ${res.status}`);
      }
      return await res.text();
    }
  } catch (e: any) {
    console.error(`Failed to fetch file content for ${fileId}:`, e);
    return `[Could not read file ${fileId}: ${e.message}]`;
  }
}

async function startServer() {
  await ensureVault();

  // The session secret persists so that restarting the app does not sign you
  // out. Generated once, on first boot.
  let sessionSecret = (await loadConfig())[SECRET_KEY];
  if (!sessionSecret) {
    sessionSecret = newSecret();
    await setEnvKey(SECRET_KEY, sessionSecret);
  }

  const passcodeHash = async () => (await loadConfig())[PASSCODE_KEY] || '';
  const isAuthed = async (req: any) => {
    if (!(await passcodeHash())) return true; // no passcode set — app is open
    return verifySession(sessionSecret, parseCookies(req.headers?.cookie)[SESSION_COOKIE]);
  };

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    if (request.url !== '/ws/journal') return;
    if (!(await isAuthed(request))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // A long journal entry is easily past the 100kb default.
  app.use(express.json({ limit: '4mb' }));

  /* ---- the lock ---------------------------------------------------------
     Only /api is gated. The SPA shell stays public because it holds no data
     and has to load in order to draw the lock screen at all. */

  app.get('/api/auth/status', async (req, res) => {
    const locked = Boolean(await passcodeHash());
    res.json({ success: true, locked, authed: await isAuthed(req) });
  });

  app.post('/api/auth/unlock', async (req, res) => {
    const stored = await passcodeHash();
    if (!stored) return res.json({ success: true, authed: true });

    const who = req.ip || 'local';
    const wait = throttled(who);
    if (wait) {
      return res.status(429).json({ success: false, error: `Too many attempts. Try again in ${wait}s.` });
    }

    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!verifyPasscode(passcode, stored)) {
      recordFailure(who);
      return res.status(401).json({ success: false, error: 'That is not the passcode.' });
    }

    recordSuccess(who);
    res.setHeader('Set-Cookie', sessionCookie(signSession(sessionSecret), req.protocol === 'https'));
    res.json({ success: true, authed: true });
  });

  app.post('/api/auth/lock', (req, res) => {
    res.setHeader('Set-Cookie', clearCookie());
    res.json({ success: true });
  });

  /** Set, change, or clear the passcode. Once one is set, changing it requires
   *  a live session — otherwise the lock could be taken over from outside. */
  app.post('/api/auth/passcode', async (req, res) => {
    const stored = await passcodeHash();
    if (stored && !(await isAuthed(req))) {
      return res.status(401).json({ success: false, error: 'Unlock first.' });
    }

    // A missing field is not the same as an empty one. This used to coerce
    // anything unrecognised to '' and silently REMOVE the lock, so a malformed
    // request — a typo'd field name, an old client, a retry with the wrong
    // body — quietly unlocked the vault and reported success.
    if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, 'next')) {
      return res.status(400).json({
        success: false,
        error: 'Nothing to set. Send a passcode, or send an empty one to remove the lock on purpose.',
      });
    }

    const next = typeof req.body.next === 'string' ? req.body.next : '';

    if (next === '') {
      await setEnvKey(PASSCODE_KEY, null);
      return res.json({ success: true, locked: false });
    }
    if (next.length < 4) {
      return res.status(400).json({ success: false, error: 'Use at least four characters.' });
    }

    await setEnvKey(PASSCODE_KEY, hashPasscode(next));
    // Sign the caller straight in so setting a passcode never locks you out.
    res.setHeader('Set-Cookie', sessionCookie(signSession(sessionSecret), req.protocol === 'https'));
    res.json({ success: true, locked: true });
  });

  app.use('/api', async (req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    if (await isAuthed(req)) return next();
    res.status(401).json({ success: false, error: 'Locked.' });
  });

  const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

  app.post('/api/journal/transcribe-audio', upload.single('audio'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file uploaded.' });
    }

    // The recording goes to disk FIRST, and an entry is created to hold it.
    // Everything after this point can fail without costing you the recording.
    const id = newId();
    let audio: string | undefined;
    try {
      audio = await saveAudio(id, req.file.buffer, req.file.mimetype || 'audio/webm');
      await saveEntry({ id, title: 'Untitled recording', text: '', audio });
    } catch (err: any) {
      console.error('Vault write failed before transcription:', err);
      return res.status(500).json({ success: false, error: 'Could not write to the vault: ' + err.message });
    }

    try {
      const config = await loadConfig();
      const result = await transcribe(config, req.file.buffer, req.file.mimetype || 'audio/webm', {
        engine: req.body?.engine,
        language: req.body?.language,
      });

      // What came off the recording, before anything tidied it.
      const spoken = result.text;
      let transcript = spoken;
      let verbatim: string | undefined;
      let tidiedBy: string | undefined;

      // "corrected" is the default, because reading back your own speech with
      // every "um" in it is its own small discouragement. The raw version is
      // always kept: STANDARDS §1, the recording is sacred, and so is what was
      // actually said.
      const style = req.body?.style === 'verbatim' ? 'verbatim' : 'corrected';
      if (style === 'corrected' && spoken.trim().length > 20) {
        try {
          const tidy = await tidyTranscript(config, spoken);
          if (tidy.text.trim()) {
            transcript = tidy.text;
            verbatim = spoken;
            tidiedBy = `${tidy.provider}/${tidy.model}`;
          }
        } catch (err: any) {
          // Failing to tidy costs the tidying, never the transcript.
          console.warn('Transcript cleanup failed, keeping it verbatim:', err?.message || err);
        }
      }
      const entry = await saveEntry({ id, text: transcript, verbatim });
      res.json({
        success: true,
        transcript,
        verbatim,
        style,
        tidiedBy,
        entryId: id,
        entry,
        engine: { provider: result.provider, model: result.model, local: result.local },
      });
    } catch (err: any) {
      console.error('Transcription Error:', err);
      // 200, not 500: the recording was kept, so this is a partial success and
      // the client needs the id to offer a retry.
      res.json({
        success: false,
        entryId: id,
        audioKept: Boolean(audio),
        error: err.message || err.toString(),
      });
    }
  });

  /* ---- vault ------------------------------------------------------------- */

  app.get('/api/vault/info', async (req, res) => {
    try {
      const entries = await listEntries();
      res.json({ success: true, dir: VAULT_DIR, keepAudio: KEEP_AUDIO, count: entries.length });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/vault/entries', async (req, res) => {
    try {
      res.json({ success: true, entries: await listEntries() });
    } catch (e: any) {
      console.error('Vault list error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/vault/entries/:id', async (req, res) => {
    try {
      res.json({ success: true, entry: await readEntry(req.params.id) });
    } catch (e: any) {
      res.status(404).json({ success: false, error: 'That entry is not in the vault.' });
    }
  });

  // found / occurred / english ride along with a save; saveEntry keeps any
  // field the caller does not mention.
  app.post('/api/vault/entries', async (req, res) => {
    try {
      const { id, title, text, indicators, found, occurred, english, drive } = req.body || {};
      if (typeof text !== 'string' && typeof drive !== 'string' && !occurred) {
        return res.status(400).json({ success: false, error: 'Nothing to save.' });
      }

      // Only the two fields that are actually stored per indicator. Everything
      // else about a term — its label, category and definition — is looked up
      // from the vocabulary when the entry is read, so a definition edited
      // later applies to every entry instead of leaving stale copies on disk.
      const cleanFound = Array.isArray(found)
        ? found
            .filter((r: any) => r && typeof r.id === 'string')
            .map((r: any) => ({
              id: String(r.id),
              ...(typeof r.evidence === 'string' && r.evidence ? { evidence: String(r.evidence).slice(0, 400) } : {}),
            }))
        : undefined;

      // A partial "when" is normal and expected: the writer may give words with
      // no range, or a model a range with no words.
      const iso = (v: any) => (typeof v === 'string' && /^\d{4}(-\d{2}){0,2}$/.test(v.trim()) ? v.trim() : undefined);
      const cleanOccurred = occurred
        ? {
            ...(typeof occurred.text === 'string' ? { text: occurred.text.slice(0, 300) } : {}),
            ...(iso(occurred.start) ? { start: iso(occurred.start) } : {}),
            ...(iso(occurred.end) ? { end: iso(occurred.end) } : {}),
            ...(['stated', 'anchored', 'inferred', 'unknown'].includes(occurred.confidence)
              ? { confidence: occurred.confidence }
              : {}),
          }
        : undefined;

      const entry = await saveEntry({
        id: isValidId(id) ? id : undefined,
        title,
        text,
        indicators: Array.isArray(indicators) ? indicators.map(String) : undefined,
        found: cleanFound,
        occurred: cleanOccurred,
        english: typeof english === 'string' ? english : undefined,
        drive,
      });
      res.json({ success: true, entry });
    } catch (e: any) {
      console.error('Vault save error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/vault/entries/:id/trash', async (req, res) => {
    try {
      await trashEntry(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.get('/api/vault/entries/:id/audio', async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(404).end();
    const file = await findAudio(req.params.id);
    if (!file) return res.status(404).end();
    res.sendFile(file, err => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  app.post('/api/journal/analyze-tags', async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript || transcript.trim().length < 10) {
        return res.json({ success: true, tags: [], indicators: [] });
      }

      const config = await loadConfig();
      let indicators: Awaited<ReturnType<typeof normalise>> = [];
      try {
        const result = await chat(config, {
          task: 'indicators',
          prompt: await buildPrompt(transcript),
          temperature: 0.1,
          json: true,
        });

        // Small models fence their JSON, prepend a sentence, or return a bare
        // array. None of that is worth failing a save over.
        let text = result.text.trim();
        const fence = text.match(/\u0060\u0060\u0060(?:json)?\s*([\s\S]*?)\u0060\u0060\u0060/);
        if (fence) text = fence[1].trim();
        const span = text.match(/[[{][\s\S]*[\]}]/);
        if (span) text = span[0];

        indicators = await normalise(JSON.parse(text), transcript);
      } catch (err: any) {
        // A journal entry saves whether or not anything could be said about it.
        console.warn('Indicator analysis failed:', err?.message || err);
      }

      res.json({
        success: true,
        indicators,
        // The Vault has always stored plain labels in the entry's front matter.
        tags: indicators.map(i => i.label),
      });
    } catch (e) {
      console.error('Analyze Tags Error:', e);
      res.json({ success: true, tags: [], indicators: [] });
    }
  });

  /* ---- repair and update -------------------------------------------------
     STANDARDS §6: an installed app can check and mend itself from inside
     itself. Both of these may replace what the installer shipped and neither
     goes near the vault. */

  app.get('/api/maintenance/repair', async (_req, res) => {
    try {
      res.json({ success: true, ...(await repair()) });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/maintenance/update', async (_req, res) => {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf-8'));
      res.json({ success: true, ...(await checkUpdate(String(pkg.version || '0.0.0'))) });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /* ---- episodes ----------------------------------------------------------
     A chapter over a slice of the timeline, with every claim traceable back to
     the entry it came from. */

  /** Candidate episodes, grouped by a gap in time. A starting point the writer
   *  adjusts, never a claim about what belongs together. */
  app.get('/api/episodes/propose', async (req, res) => {
    try {
      const gapDays = Math.max(1, Math.min(3650, Number(req.query.gapDays) || 120));
      const entries = (await listEntries()).map(e => ({ ...e, key: timelineKey(e) }));
      const { placed, undated } = proposeEpisodes(entries, gapDays);

      res.json({
        success: true,
        gapDays,
        episodes: placed.map(group => ({
          from: group[0].occurred?.start || '',
          to: group[group.length - 1].occurred?.end || group[group.length - 1].occurred?.start || '',
          ids: group.map(e => e.id),
          titles: group.map(e => e.title),
        })),
        undated: undated.map(e => ({ id: e.id, title: e.title })),
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /** Draft one episode from a chosen set of entries. */
  app.post('/api/episodes/draft', async (req, res) => {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter(isValidId) : [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Choose at least one entry.' });
    }

    try {
      const config = await loadConfig();

      const loaded = [];
      for (const id of ids) {
        try {
          loaded.push(await readEntry(id));
        } catch {
          console.warn(`Episode skipped unreadable entry ${id}`);
        }
      }
      if (loaded.length === 0) {
        return res.status(400).json({ success: false, error: 'None of those entries could be read.' });
      }

      // Chapters read in the order things happened, not the order they were
      // written or the order they were clicked.
      loaded.sort((a, b) => timelineKey(a) - timelineKey(b));

      const raw = String(req.body?.model || '');
      const [pickedProvider, pickedModel] = raw.includes('::') ? raw.split('::') : ['', raw];

      const draft = await draftEpisode(config, loaded, {
        focus: typeof req.body?.focus === 'string' ? req.body.focus.slice(0, 400) : undefined,
        explainTerms: req.body?.explainTerms !== false,
        ...(pickedModel ? { model: pickedModel } : {}),
        ...(pickedProvider ? { providerId: pickedProvider } : {}),
      });

      res.json({ success: true, ...draft });
    } catch (e: any) {
      console.error('Episode draft failed:', e);
      res.status(500).json({ success: false, error: e.message || String(e) });
    }
  });

  /** Greek in, English beside it.
   *
   *  The translation is stored under its own heading in the same file, never
   *  in place of the original. DeepL is tried first when a key is set because
   *  it renders a sentence; a language model rewrites one, and quietly tidies
   *  fragments, softens anger and fixes grammar. For a diary that is a nicety.
   *  For a record of what somebody said to you it is a loss you cannot see. */
  app.post('/api/journal/translate', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    const id = req.body?.id;
    if (!text) return res.status(400).json({ success: false, error: 'Nothing to translate.' });

    try {
      const config = await loadConfig();
      const result = await translate(config, text);

      // Saved with the entry when there is one, so it survives a reload.
      if (isValidId(id)) {
        await saveEntry({ id, english: result.text }).catch(err =>
          console.warn('Could not store the translation:', err?.message || err),
        );
      }

      res.json({ success: true, ...result });
    } catch (e: any) {
      res.json({ success: false, error: e?.message || String(e) });
    }
  });

  /** Roughly when did this happen?
   *
   *  The hard part of a life story is not remembering an event, it is placing
   *  it. Someone who says "around when we moved" is being accurate, and asking
   *  them for a date would make them invent one. So the writer's own words are
   *  kept verbatim and a model is asked only for a RANGE wide enough to be
   *  honest, which is all that ordering actually needs.
   *
   *  Entries the writer has already dated are passed in as anchors, because
   *  "the year after we moved" is answerable once "we moved" has a range. */
  app.post('/api/journal/when', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (text.length < 15) return res.json({ success: true, occurred: {} });

    try {
      const config = await loadConfig();

      const anchors = (await listEntries())
        .filter(e => e.occurred?.start && e.occurred?.text)
        .slice(0, 40)
        .map(e => `- "${e.occurred.text}" = ${e.occurred.start}${e.occurred.end ? ` to ${e.occurred.end}` : ''}`)
        .join('\n');

      const today = new Date().toISOString().slice(0, 10);
      const prompt = `Read this journal entry and work out roughly WHEN the events in it happened. Today is ${today}.

Return ONLY JSON, no code fence, no commentary:
{"text":"<the writer's own words about when, copied exactly, or \"\" if they gave none>",
 "start":"<earliest it could have been, YYYY or YYYY-MM or YYYY-MM-DD>",
 "end":"<latest it could have been, same format>",
 "confidence":"stated|anchored|inferred|unknown"}

Rules:
- "text" must be an EXACT quote from the entry, or empty. Never paraphrase it, never invent one.
- A wide range is a good answer. A whole year, or several, is fine and honest.
- "stated" only if the entry names a date or year outright.
- "anchored" if you placed it using one of the known points below.
- "inferred" if you worked it out from context — someone's age, a school year, a season.
- "unknown" if there is genuinely nothing to go on: return empty strings for start and end.
- Do NOT guess to be helpful. An unknown answer is more useful than a wrong one.
${anchors ? `\nPoints this writer has already dated:\n${anchors}\n` : ''}
Entry:
"""
${text}
"""`;

      const result = await chat(config, { task: 'when', prompt, temperature: 0.1, json: true });

      let raw = result.text.trim();
      const fence = raw.match(/\u0060\u0060\u0060(?:json)?\s*([\s\S]*?)\u0060\u0060\u0060/);
      if (fence) raw = fence[1].trim();
      const span = raw.match(/\{[\s\S]*\}/);
      if (span) raw = span[0];

      const parsed = JSON.parse(raw);
      const iso = (v: any) => (typeof v === 'string' && /^\d{4}(-\d{2}){0,2}$/.test(v.trim()) ? v.trim() : undefined);

      // The quote has to be real, exactly as for indicator evidence.
      const hay = text.toLowerCase().replace(/\s+/g, ' ');
      const said = String(parsed.text || '').trim();
      const quoted = said && hay.includes(said.toLowerCase().replace(/\s+/g, ' ')) ? said : undefined;

      const occurred = {
        text: quoted,
        start: iso(parsed.start),
        end: iso(parsed.end),
        confidence: ['stated', 'anchored', 'inferred', 'unknown'].includes(parsed.confidence)
          ? parsed.confidence
          : 'inferred',
      };

      res.json({ success: true, occurred, provider: result.provider, model: result.model });
    } catch (e: any) {
      console.warn('When-analysis failed:', e?.message || e);
      // An entry saves whether or not anything could be said about when it was.
      res.json({ success: true, occurred: {}, error: e?.message || String(e) });
    }
  });

  /** The vocabulary itself, so the interface can show what a term means beside
   *  the tag rather than leaving a label nobody can check. */
  app.get('/api/vocabulary', async (_req, res) => {
    res.json({ success: true, categories: CATEGORIES, terms: await loadTerms() });
  });

  /* ---- providers ---------------------------------------------------------- */

  /** What is configured, what is reachable, and what a local runtime actually
   *  has installed. */
  /** What is configured, what is reachable, and which model is assigned to
   *  each job.
   *
   *  `?load=1` is the "Load models" button: it asks every provider what
   *  models it actually has. Plain GETs that cost nothing, but a dozen network
   *  calls, so it is not what happens merely by opening Settings.
   *  STANDARDS #10 — the endpoint is the authority on model names, not us. */
  app.get('/api/providers', async (req, res) => {
    try {
      const config = await loadConfig();
      const deep = req.query.load === '1' || req.query.deep === '1';
      const assignments: Record<string, { providerId: string; model: string }[]> = {};
      for (const t of TASKS) assignments[t.id] = slotsFor(config, t.id);

      res.json({
        success: true,
        routing: readRouting(config),
        localOnly: isLocalOnly(config),
        providers: await probe(config, deep),
        loaded: deep,
        tasks: TASKS,
        assignments,
        synthesis: synthesisChoices(config),
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /** Check ONE provider: is the key accepted, and what can it reach?
   *
   *  Pasting a key and having no way to tell whether it works is how someone
   *  ends up assuming the app is broken. This asks the provider for its model
   *  list — a plain GET that costs nothing — and reports the answer, or the
   *  reason, in plain English. */
  app.post('/api/providers/check', async (req, res) => {
    const id = String(req.body?.id || '');
    try {
      const config = await loadConfig();
      const provider = resolveProviders(config).find(p => p.id === id);
      if (!provider) {
        return res.json({
          success: false,
          error: 'Nothing is configured for that provider yet. Paste a key, or an endpoint, and save first.',
        });
      }
      const models = await listModels(provider);
      res.json({
        success: true,
        id,
        label: provider.label,
        count: models.length,
        sample: models.slice(0, 6),
      });
    } catch (e: any) {
      res.json({ success: false, id, error: e?.message || String(e) });
    }
  });

  /** Try one assigned slot for real, and report what happened in plain
   *  English. Assigning a model you cannot reach is the failure this app used
   *  to discover halfway through a recording. */
  app.post('/api/providers/test', async (req, res) => {
    const task = String(req.body?.task || '') as Task;
    if (!TASKS.some(t => t.id === task)) {
      return res.status(400).json({ success: false, error: 'Unknown job.' });
    }
    if (task === 'transcribe') {
      return res.json({
        success: false,
        error: 'Transcription is tested by making a recording — there is no cheap way to fake one.',
      });
    }
    try {
      const config = await loadConfig();
      const result = await chat(config, {
        task,
        prompt: 'Reply with the single word: ready',
        temperature: 0,
        // Generous on purpose. 16 was enough for an ordinary model and far too
        // little for a reasoning one, which spends its budget thinking first
        // and then has nothing left to answer with — so the test failed on
        // models that work perfectly well in the app.
        maxTokens: 2048,
      });
      res.json({
        success: true,
        provider: result.provider,
        model: result.model,
        local: result.local,
        reply: result.text.trim().slice(0, 80),
      });
    } catch (e: any) {
      res.json({ success: false, error: e.message || String(e) });
    }
  });

  app.get('/api/config', async (req, res) => {
    const config = await loadConfig();
    const safeConfig: Record<string, string> = {};
    for (const key of CONFIG_KEYS) {
      const value = config[key] || '';
      // Secrets go out masked. The client sends the mask back untouched and the
      // server keeps the stored value, so a key can be set without ever being
      // readable again.
      safeConfig[key] = SECRET_KEYS.has(key) && value.length > 4 ? '***' + value.slice(-4) : value;
    }
    res.json(safeConfig);
  });

  app.post('/api/config', async (req, res) => {
    const newConfig = req.body || {};
    const currentConfig = await loadConfig();
    const toSave: any = {};
    for (const key of CONFIG_KEYS) {
      const incoming = newConfig[key];
      if (typeof incoming !== 'string') continue;
      toSave[key] = incoming.startsWith('***') ? currentConfig[key] || '' : incoming;
    }
    await saveConfig(toSave);
    res.json({ success: true });
  });

  /* ---- Google ------------------------------------------------------------
     The browser never handles a Google credential. It asks the server to start
     consent, and thereafter simply asks for things to be archived. */

  /* ---- local-only --------------------------------------------------------
     Routing is a promise, not a preference. Closing these here means a stray
     click cannot put an entry into someone else's datacentre, whatever is
     sitting in .env. */
  app.use(['/api/google', '/api/drive', '/auth/callback'], async (_req, res, next) => {
    if (isLocalOnly(await loadConfig())) {
      return res.status(409).json({
        success: false,
        error: 'Local-only routing is on, so Google Drive is switched off. Change it under Settings → Models.',
      });
    }
    next();
  });

  app.get('/api/google/status', async (req, res) => {
    try {
      res.json({ success: true, ...(await google.status()) });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/google/url', async (req, res) => {
    try {
      const config = await loadConfig();
      if (!config.GOOGLE_CLIENT_ID) {
        return res
          .status(400)
          .json({ success: false, error: 'Add a Google OAuth client ID and secret in Settings first.' });
      }
      const uri = redirectUri(req);
      res.json({ success: true, url: google.authUrl(config.GOOGLE_CLIENT_ID, uri, google.newState()), redirectUri: uri });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/google/disconnect', async (req, res) => {
    try {
      await google.disconnect();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  const closingPage = (title: string, detail: string, ok: boolean) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B0808;
    color:#F0E4D2;font-family:"Segoe UI",system-ui,sans-serif;text-align:center;padding:2rem}
  h1{font-size:1.4rem;letter-spacing:.12em;text-transform:uppercase;font-weight:400;
    color:${ok ? '#D8C39B' : '#A6342A'};margin:0 0 .6rem}
  p{color:#B1A08C;max-width:46ch;margin:0}
</style></head>
<body><div><h1>${title}</h1><p>${detail}</p></div>
<script>
  if (window.opener) { window.opener.postMessage({ type: 'GOOGLE_LINK_DONE', ok: ${ok} }, window.location.origin); setTimeout(function(){ window.close(); }, ${ok ? 900 : 4000}); }
  else { setTimeout(function(){ window.location.href = '/'; }, ${ok ? 900 : 4000}); }
</script></body></html>`;

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    try {
      const { code, state, error } = req.query;
      if (error) throw new Error(String(error));
      if (!code) throw new Error('Google sent no authorization code.');
      // The state proves this callback answers a consent request that started
      // here, rather than one a third party induced.
      if (!google.consumeState(state)) throw new Error('That linking attempt expired. Start it again from Settings.');

      const { email } = await google.exchangeCode(String(code), redirectUri(req));
      res.send(closingPage('Linked', `My Story can now write to the Drive of ${email}.`, true));
    } catch (e: any) {
      console.error('Google callback error:', e);
      res.status(400).send(closingPage('Linking failed', String(e.message || e), false));
    }
  });

  // Google Drive/Docs Operations
  app.get('/api/drive/list-files', async (req, res) => {
    try {
      const accessToken = await google.getAccessToken();
      const driveRes = await fetch("https://www.googleapis.com/drive/v3/files?q=trashed=false and (mimeType='application/vnd.google-apps.document' or name contains 'My Story' or name contains 'Reflections' or mimeType='text/markdown')&orderBy=createdTime desc&fields=files(id,name,mimeType,createdTime)", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const data = await driveRes.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      res.json({ success: true, files: data.files || [] });
    } catch (e: any) {
      console.error("List Files Error:", e);
      res.status(e instanceof NotConnected ? 401 : 500).json({ success: false, error: e.message || e.toString() });
    }
  });

  app.post('/api/drive/create-doc', async (req, res) => {
    try {
      const { title, content } = req.body;
      const accessToken = await google.getAccessToken();

      const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      });

      const docData = await createRes.json();
      if (docData.error) {
        throw new Error(docData.error.message || JSON.stringify(docData.error));
      }

      const documentId = docData.documentId;

      const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content
              }
            }
          ]
        })
      });

      const updateData = await updateRes.json();
      if (updateData.error) {
        throw new Error(updateData.error.message || JSON.stringify(updateData.error));
      }

      const viewUrl = `https://docs.google.com/document/d/${documentId}/edit`;
      res.json({ success: true, documentId, viewUrl });
    } catch (e: any) {
      console.error("Create Doc Error:", e);
      res.status(e instanceof NotConnected ? 401 : 500).json({ success: false, error: e.message || e.toString() });
    }
  });

  app.post('/api/drive/upload-file', async (req, res) => {
    try {
      const { filename, content, mimeType } = req.body;
      const accessToken = await google.getAccessToken();

      const metadata = {
        name: filename,
        mimeType: mimeType || 'text/markdown'
      };

      const boundary = 'foo_bar_boundary';
      const multipartBody = 
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType || 'text/markdown'}\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });

      const uploadData = await uploadRes.json();
      if (uploadData.error) {
        throw new Error(uploadData.error.message || JSON.stringify(uploadData.error));
      }

      const fileId = uploadData.id;
      const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
      res.json({ success: true, fileId, viewUrl });
    } catch (e: any) {
      console.error("Upload File Error:", e);
      res.status(e instanceof NotConnected ? 401 : 500).json({ success: false, error: e.message || e.toString() });
    }
  });

  app.post('/api/journal/autotitle', async (req, res) => {
    const { transcript } = req.body;
    const fallback = () =>
      String(transcript || '')
        .split(/\s+/)
        .slice(0, 5)
        .join(' ')
        .slice(0, 60) || 'Untitled Memory';

    if (!transcript || transcript.trim().length < 5) {
      return res.json({ title: 'Untitled Memory' });
    }
    try {
      const config = await loadConfig();
      const result = await chat(config, {
        task: 'title',
        temperature: 0.3,
        prompt: `Based on the following journal entry, generate a concise, elegant, evocative title of 2 to 5 words. Do not use quotes, punctuation, or generic filler. Return only the title.

Entry:
"${transcript}"`,
      });
      const title = result.text.trim().replace(/^["'\u201c]|["'\u201d]$/g, '').slice(0, 80);
      res.json({ title: title || fallback() });
    } catch (e: any) {
      console.warn('Autotitle failed:', e?.message || e);
      res.json({ title: fallback() });
    }
  });

  app.post('/api/synthesize', async (req, res) => {
    const { files, localIds, model, prompt } = req.body;
    const config = await loadConfig();

    try {
      const parts: string[] = [];

      // Local entries first — they are the source of truth.
      if (Array.isArray(localIds) && localIds.length > 0) {
        for (const id of localIds) {
          if (!isValidId(id)) continue;
          try {
            const entry = await readEntry(id);
            parts.push(`--- ENTRY: ${entry.title} (${entry.created.slice(0, 10)}) ---\n${entry.text}\n`);
          } catch (e) {
            console.warn(`Synthesis skipped unreadable entry ${id}`);
          }
        }
      }

      if (files && files.length > 0) {
        const accessToken = await google.getAccessToken();
        const contents = await Promise.all(files.map(async (f: any) => {
          const contentText = await fetchFileContent(accessToken, f.id, f.mimeType);
          return `--- FILE: ${f.name} ---\n${contentText}\n`;
        }));
        parts.push(...contents);
      }

      if (parts.length === 0) {
        return res.status(400).json({ success: false, error: 'No sources selected.' });
      }

      const filesContent = parts.join('\n');

      const contentPrompt = `${prompt}\n\nSelected Source Materials Content:\n${filesContent}`;

      // The picker sends "<providerId>::<model>". A bare value is still
      // accepted and routed down the normal chain.
      const raw = String(model || '');
      const [pickedProvider, pickedModel] = raw.includes('::') ? raw.split('::') : ['', raw];

      const result = await chat(config, {
        task: 'synthesis',
        prompt: contentPrompt,
        temperature: 0.2,
        maxTokens: 4000,
        ...(pickedModel ? { model: pickedModel } : {}),
        ...(pickedProvider ? { providerId: pickedProvider } : {}),
      });

      res.json({
        success: true,
        draft: result.text,
        provider: result.provider,
        model: result.model,
        local: result.local,
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ success: false, error: e.message || e.toString() });
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        
        if (data.type === 'speak_trigger_opinion') {
          const config = await loadConfig();
          const transcriptText = data.transcript || '';
          
          const prompt = `You are a supportive, validating, and empathetic companion listening to a journal writer. 
They have just shared these raw thoughts/memories:
"${transcriptText}"

Provide a warm, grounded, validating response in 1-3 sentences. Speak with sincerity and comfort. Do not be overly medical or clinical. Avoid fawning or using overly dramatic AI clichés.`;
          
          try {
            const responseText = (await chat(config, { task: 'companion', prompt, temperature: 0.7 })).text;
            ws.send(JSON.stringify({ type: 'audio_response', text: responseText }));
          } catch (err: any) {
            console.error(err);
            ws.send(JSON.stringify({ type: 'audio_response', text: `Failed to generate opinion: ${err.message}` }));
          }
        } else if (data.type === 'speak_trigger_more') {
          const config = await loadConfig();
          const transcriptText = data.transcript || '';
          
          const prompt = `You are a gentle, supportive, and compassionate journal assistant. 
The user is sharing their thoughts and memories, and would like a gentle prompt or question to help them elaborate on their narrative.
Current narrative:
"${transcriptText}"

Ask a gentle, open-ended question or request in 1-2 sentences that helps them explore deeper or continue their thoughts without feeling pressured. Keep it natural and warm.`;
          
          try {
            const responseText = (await chat(config, { task: 'companion', prompt, temperature: 0.7 })).text;
            ws.send(JSON.stringify({ type: 'audio_response', text: responseText }));
          } catch (err: any) {
            console.error(err);
            ws.send(JSON.stringify({ type: 'audio_response', text: `Failed to generate prompt: ${err.message}` }));
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // EADDRINUSE is the single most likely first-run failure, and Node's own
  // message is a stack trace. STANDARDS #4.
  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(
        `\n  !  Port ${PORT} is already in use, so My Story did not start.\n` +
          `     Something else is listening there — another copy of this app, or\n` +
          `     another project's dev server.\n\n` +
          `     Start it somewhere else instead:   PORT=4748 npm run dev\n`,
      );
      process.exit(1);
    }
    if (err?.code === 'EACCES') {
      console.error(
        `\n  !  Not allowed to listen on port ${PORT}.\n` +
          `     Ports below 1024 need administrator rights. Pick a higher one:\n` +
          `     PORT=38726 npm run dev\n`,
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(PORT, HOST || undefined, async () => {
    console.log(`My Story running on http://localhost:${PORT}` + (HOST ? ` (bound to ${HOST})` : ''));
    console.log(`Vault: ${VAULT_DIR}`);
    const boot = await loadConfig();
    const chain = await probe(boot);
    const usable = chain.filter(p => !p.error);
    console.log(
      `Models: ${readRouting(boot)} — ` +
        (usable.length ? usable.map(p => p.label + (p.local ? ' (local)' : '')).join(', ') : 'none configured'),
    );
    const loopback = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
    const where = HOST || 'every interface';
    if (!(await passcodeHash()) && !loopback) {
      console.warn(
        `\n  !  No passcode is set, and this is listening on ${where}.\n` +
        `     Anyone who can reach this machine on port ${PORT} can read the vault.\n` +
        `     Set one under Settings, or bind HOST to your Tailscale address.\n`
      );
    }
  });
}

startServer();
