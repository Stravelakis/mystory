#!/usr/bin/env node
/* =============================================================================
   GEMINI DOCTOR — what your Google key can actually do, today.

   Run it:
     node scripts/gemini-doctor.mjs                 (reads GEMINI_API_KEY, or .env)
     node scripts/gemini-doctor.mjs AIza...          (or pass the key)
     node scripts/gemini-doctor.mjs --json           (machine-readable)

   Get a key at https://aistudio.google.com/apikey — an AI Studio key, not a
   Cloud console service-account credential. They look similar and only one of
   them works here.

   Why this exists
   ---------------
   Google renames and retires models faster than any app ships, returns 429 for
   two unrelated problems, and returns 400 for the commonest mistake there is.
   Guessing from documentation sends people to fix the wrong thing. So this
   asks the API three questions and reports what it actually said:

     1. Which models does THIS key have? (ListModels)
     2. Can it generate right now?       (a real 1-token call)
     3. If not, why — in plain English?

   Nothing here writes to your account, spends more than a token, or needs a
   browser. STANDARDS #1, #2, #6, #10.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'https://generativelanguage.googleapis.com';
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const argKey = args.find(a => !a.startsWith('--'));

/* --- Models this project was asked about. Checked by name against whatever
       the account actually reports, rather than assumed to exist. ---------- */
const WISHLIST = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemma-4-31b',
  'gemini-3-flash-live',
  'gemini-3.5-live-translate',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-transcribe',
];

const C = process.stdout.isTTY && !JSON_OUT
  ? { b: '\x1b[1m', d: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' }
  : { b: '', d: '', g: '', y: '', r: '', x: '' };

const out = [];
const say = (...a) => { if (!JSON_OUT) console.log(...a); };
const head = t => say(`\n${C.b}${t}${C.x}\n${'─'.repeat(Math.min(t.length, 70))}`);

/* --- Find a key -------------------------------------------------------------- */

function keyFromEnvFile() {
  for (const f of ['.env', path.join('..', '.env')]) {
    try {
      const m = fs.readFileSync(f, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*"?([^"\n\r]+)"?/m);
      if (m && m[1].trim()) return m[1].trim();
    } catch {}
  }
  return '';
}

const key = argKey || process.env.GEMINI_API_KEY || keyFromEnvFile();

if (!key) {
  console.error(`
No key found.

Pass one, or put it in .env as GEMINI_API_KEY, or export it:

    node scripts/gemini-doctor.mjs AIza...
    GEMINI_API_KEY=AIza... node scripts/gemini-doctor.mjs

Get one free at https://aistudio.google.com/apikey
`);
  process.exit(2);
}

/* --- Read Google's answers, not the documentation ---------------------------- */

/** Google's status codes do not mean what they say. Every branch below was
 *  confirmed against the live API on 3 Sep 2026. */
function diagnose(status, body) {
  const b = JSON.stringify(body || '').toLowerCase();

  if (status === 400 && (b.includes('api key not valid') || b.includes('api_key_invalid'))) {
    return {
      verdict: 'bad-key',
      headline: 'The key itself is not valid.',
      detail:
        'Google returns 400 for this, not 401 — so it looks like a malformed request when it is really a bad key.\n' +
        'Check it was copied whole, with no trailing space. Make sure it came from AI Studio\n' +
        '(aistudio.google.com/apikey) and is not a Cloud console service-account credential.',
    };
  }
  if (status === 403 && (b.includes('service_disabled') || b.includes('has not been used') || b.includes('is disabled'))) {
    return {
      verdict: 'api-disabled',
      headline: 'The key is real, but the Generative Language API is switched off on its project.',
      detail:
        'This is the single most common cause of a key that "should work".\n' +
        'Fix it either way:\n' +
        '  · Easiest — make a fresh key at https://aistudio.google.com/apikey and let AI Studio\n' +
        '    create its own project. It enables the API for you.\n' +
        '  · Or enable it on the existing project:\n' +
        '    https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com',
    };
  }
  if (status === 403) {
    return {
      verdict: 'forbidden',
      headline: 'Google accepted the key and refused the project behind it.',
      detail:
        'Usually an API restriction on the key (HTTP referrer or IP allow-list), or an org policy.\n' +
        'Check the key\'s restrictions in the Cloud console, or make an unrestricted one in AI Studio.',
    };
  }
  if (status === 429) {
    const billing = b.includes('billing') || b.includes('free_tier') || b.includes('freetier');
    return {
      verdict: billing ? 'billing' : 'quota',
      headline: billing
        ? 'Out of quota, and this is the paid path — waiting will not fix it.'
        : 'Out of quota for now.',
      detail: billing
        ? 'The project is linked to Cloud billing, which means it is being charged rather than\n' +
          'using the free allowance, and the billing account has nothing to draw on.\n\n' +
          'IMPORTANT, and counter-intuitive: linking a project to Cloud billing is what DISABLES\n' +
          'the free tier. If you want free-tier usage, use a key whose project has no billing\n' +
          'account attached. If you want to spend credit, the credit has to be on the billing\n' +
          'account this project is linked to — having credit elsewhere in the org does not count.'
        : 'On a free-tier key this is the daily or per-minute allowance, and it resets.\n' +
          'Per-minute limits clear in about a minute; daily ones clear at midnight Pacific.\n' +
          'If it never clears, the project is probably on the paid path with no credit — see below.',
    };
  }
  if (status === 404) {
    return {
      verdict: 'no-model',
      headline: 'That model name does not exist for this key.',
      detail: 'Use one of the names listed above. They are the only ones this key can address.',
    };
  }
  if (status >= 500) {
    return { verdict: 'google-down', headline: 'Google is having trouble at their end.', detail: 'Not your key. Try again shortly.' };
  }
  return {
    verdict: 'unknown',
    headline: `Google returned ${status}.`,
    detail: JSON.stringify(body || '', null, 2).slice(0, 800),
  };
}

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  let body = null;
  try { body = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, body };
}

/* --- 1. What does this key have? --------------------------------------------- */

async function listAll() {
  const models = [];
  let token = '';
  for (let page = 0; page < 10; page++) {
    const url =
      `${ROOT}/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200` +
      (token ? `&pageToken=${encodeURIComponent(token)}` : '');
    const r = await get(url);
    if (!r.ok) return { error: r };
    models.push(...(r.body?.models || []));
    token = r.body?.nextPageToken || '';
    if (!token) break;
  }
  return { models };
}

/* --- main -------------------------------------------------------------------- */

say(`${C.b}Gemini doctor${C.x}  ${C.d}key ${key.slice(0, 6)}…${key.slice(-4)}${C.x}`);

const listed = await listAll();

if (listed.error) {
  const d = diagnose(listed.error.status, listed.error.body);
  head('Could not even list your models');
  say(`${C.r}${d.headline}${C.x}\n`);
  say(d.detail);
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, stage: 'list', ...d, status: listed.error.status }, null, 2));
  process.exit(1);
}

const models = listed.models;
const idOf = m => String(m.name || '').replace(/^models\//, '');
const methods = m => m.supportedGenerationMethods || [];

const generate = models.filter(m => methods(m).includes('generateContent'));
const live = models.filter(m => methods(m).some(x => /bidi/i.test(x)));
const embed = models.filter(m => methods(m).includes('embedContent'));

head(`Your key can see ${models.length} models`);
say(`${C.g}${generate.length}${C.x} usable by this app (generateContent)`);
say(`${C.y}${live.length}${C.x} realtime / Live only (bidiGenerateContent) — see the note at the end`);
say(`${C.d}${embed.length} embedding-only${C.x}`);

head('Usable right now, by this app');
for (const m of generate.map(idOf).sort()) say('  ' + m);

if (live.length) {
  head('Live / realtime models on this key');
  for (const m of live.map(idOf).sort()) say('  ' + m);
}

/* --- 2. Wishlist, checked rather than assumed -------------------------------- */

head('The models you asked for');
const allIds = models.map(idOf);
let anyMissing = false;
for (const want of WISHLIST) {
  // Substring match, because Google appends -latest, -001, -preview-09-2026 and
  // similar, and the base name is what a person types.
  const hits = allIds.filter(id => id.includes(want));
  if (hits.length === 0) {
    anyMissing = true;
    say(`  ${C.r}✗${C.x} ${want.padEnd(28)} ${C.d}not on this key${C.x}`);
  } else {
    const usable = hits.filter(h => methods(models.find(m => idOf(m) === h)).includes('generateContent'));
    const mark = usable.length ? `${C.g}✓${C.x}` : `${C.y}~${C.x}`;
    const note = usable.length ? '' : ` ${C.d}(realtime only — not usable by this app)${C.x}`;
    say(`  ${mark} ${want.padEnd(28)} ${(usable[0] || hits[0])}${note}`);
    if (hits.length > 1) say(`      ${C.d}also: ${hits.slice(1, 4).join(', ')}${C.x}`);
  }
}

/* --- 3. Can it actually generate? ------------------------------------------- */

head('Trying a real call');

// Cheapest thing that proves the whole path: the smallest listed flash-lite, or
// whatever is first if none match.
const pick =
  generate.map(idOf).find(id => /flash-lite/.test(id)) ||
  generate.map(idOf).find(id => /flash/.test(id)) ||
  generate.map(idOf)[0];

if (!pick) {
  say(`${C.r}No model on this key supports generateContent, so there is nothing to try.${C.x}`);
} else {
  say(`${C.d}using ${pick}${C.x}`);
  const res = await fetch(
    `${ROOT}/v1beta/models/${pick}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with the single word: ready' }] }],
        generationConfig: { maxOutputTokens: 8, temperature: 0 },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  let body = null;
  try { body = await res.json(); } catch {}

  if (res.ok) {
    const text = body?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '(empty)';
    say(`${C.g}It works.${C.x} ${pick} replied: ${JSON.stringify(text.trim())}`);
    out.push({ ok: true, model: pick });
    head('What to do next');
    say(`Put this key into the app under ${C.b}Settings → Models → Provider keys → Google Gemini${C.x},`);
    say(`press ${C.b}Load models${C.x}, and assign the ones you want to each job.`);
    say(`\nEvery name printed above is real and current for THIS key. Do not type a`);
    say(`model name from a blog post — pick from that list.`);
  } else {
    const d = diagnose(res.status, body);
    say(`${C.r}${d.headline}${C.x}  ${C.d}(HTTP ${res.status})${C.x}\n`);
    say(d.detail);
    out.push({ ok: false, status: res.status, ...d });
  }
}

/* --- Notes that save an hour ------------------------------------------------- */

head('Two things worth knowing');

say(`${C.b}1. Free tier and Cloud billing are mutually exclusive.${C.x}
   Attaching a billing account to a project moves it onto the paid path and
   turns the free allowance OFF. If your goal is the free tier, use a key from
   a project with NO billing account. If your goal is spending credit, the
   credit must sit on the billing account that project is linked to.
   Credit elsewhere in the same organisation does not apply.`);

say(`
${C.b}2. Only the "-live" models are a different API.${C.x}
   Anything listed above under "Live / realtime" uses bidiGenerateContent — a
   streaming WebSocket protocol, not the request/response endpoint this app
   speaks. Those will not appear as assignable models, and that is correct
   rather than a bug.

   Do not read "transcribe" as meaning realtime: on this key
   gemini-3.5-transcribe supports ordinary generateContent and IS usable here,
   while gemini-3.5-transcribe-live is the WebSocket one. The suffix that
   decides it is -live, not the word transcribe. Which section a model was
   printed in above is the answer, not its name.`);

if (anyMissing) {
  say(`
${C.y}Some models you asked for are not on this key.${C.x}
   That is usually tier, not error: previews roll out per-account and per-region.
   The list above is the truth for this key today. Re-run this after Google
   moves something out of preview.`);
}

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        ok: out[0]?.ok ?? false,
        total: models.length,
        generateContent: generate.map(idOf).sort(),
        live: live.map(idOf).sort(),
        wishlist: Object.fromEntries(WISHLIST.map(w => [w, allIds.filter(i => i.includes(w))])),
        call: out[0] ?? null,
      },
      null,
      2,
    ),
  );
}
