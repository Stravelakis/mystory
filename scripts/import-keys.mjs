#!/usr/bin/env node
/* =============================================================================
   IMPORT KEYS — copy provider keys from another .env into this app's .env.

     node scripts/import-keys.mjs "<path to the other .env>"
     node scripts/import-keys.mjs "<path>" --dry-run

   Only the keys this app actually uses are copied, and only the ones that are
   present and non-empty. Everything else in the source file is ignored and
   never read into memory beyond the parse.

   It prints key NAMES and value LENGTHS, never values. That matters: this is
   the sort of script whose output ends up pasted into a chat window or a bug
   report.

   Existing values in this app's .env are kept unless --overwrite is passed, so
   running it twice is safe and it will not clobber something you set by hand.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const source = args.find(a => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
const OVERWRITE = args.includes('--overwrite');

if (!source) {
  console.error(`
Usage:
  node scripts/import-keys.mjs "<path to another .env>" [--dry-run] [--overwrite]

Copies only the provider keys My Story understands. Prints names, never values.
`);
  process.exit(2);
}

/** What this app can use, and the name it wants it under. A source file written
 *  for another tool will not always agree on spelling — OMNIROUTE_URL here,
 *  OMNIROUTE_BASE_URL there — so aliases are explicit rather than guessed. */
const WANTED = {
  GEMINI_API_KEY: ['GEMINI_API_KEY'],
  GROQ_API_KEY: ['GROQ_API_KEY'],
  MISTRAL_API_KEY: ['MISTRAL_API_KEY'],
  NVIDIA_API_KEY: ['NVIDIA_API_KEY'],
  CEREBRAS_API_KEY: ['CEREBRAS_API_KEY'],
  OPENROUTER_API_KEY: ['OPENROUTER_API_KEY'],
  DEEPL_API_KEY: ['DEEPL_API_KEY'],
  OMNIROUTE_API_KEY: ['OMNIROUTE_API_KEY'],
  OMNIROUTE_BASE_URL: ['OMNIROUTE_BASE_URL', 'OMNIROUTE_URL'],
  GOOGLE_CLIENT_ID: ['GOOGLE_CLIENT_ID', 'GDRIVE_CLIENT_ID'],
  GOOGLE_CLIENT_SECRET: ['GOOGLE_CLIENT_SECRET', 'GDRIVE_CLIENT_SECRET'],
};

function parseEnv(file) {
  const out = {};
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = (m[2] ?? '').trim();
    // Strip one layer of matching quotes, and anything after an unquoted #.
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}

const src = parseEnv(source);
const ENV_PATH = path.join(process.cwd(), '.env');
const existing = fs.existsSync(ENV_PATH) ? parseEnv(ENV_PATH) : {};

const copied = [];
const skipped = [];
const missing = [];

for (const [target, aliases] of Object.entries(WANTED)) {
  const from = aliases.find(a => (src[a] || '').trim());
  if (!from) {
    missing.push(target);
    continue;
  }
  if ((existing[target] || '').trim() && !OVERWRITE) {
    skipped.push(target);
    continue;
  }
  existing[target] = src[from].trim();
  copied.push([target, from, existing[target].length]);
}

// OmniRoute needs /v1 on the end; a URL written for a dashboard usually is not.
if (existing.OMNIROUTE_BASE_URL && !/\/v\d+$/.test(existing.OMNIROUTE_BASE_URL.replace(/\/+$/, ''))) {
  existing.OMNIROUTE_BASE_URL = existing.OMNIROUTE_BASE_URL.replace(/\/+$/, '') + '/v1';
  console.log('  · appended /v1 to OMNIROUTE_BASE_URL');
}

console.log(`\nSource: ${source}`);
console.log(`  ${Object.keys(src).length} variables found, ${Object.keys(WANTED).length} of interest.\n`);

if (copied.length) {
  console.log('Copied:');
  for (const [target, from, len] of copied) {
    const note = from === target ? '' : `  (from ${from})`;
    console.log(`  + ${target.padEnd(22)} ${String(len).padStart(4)} chars${note}`);
  }
}
if (skipped.length) {
  console.log('\nAlready set here, left alone (use --overwrite to replace):');
  for (const k of skipped) console.log(`  = ${k}`);
}
if (missing.length) {
  console.log('\nNot in the source file:');
  for (const k of missing) console.log(`  - ${k}`);
}

if (DRY) {
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

if (!copied.length) {
  console.log('\nNothing to write.');
  process.exit(0);
}

// Owner-readable only. This file is the one thing here worth protecting.
let body = '';
for (const [k, v] of Object.entries(existing)) {
  if (typeof v === 'string') body += `${k}="${v.replace(/"/g, '\\"')}"\n`;
}
fs.writeFileSync(ENV_PATH, body, { mode: 0o600 });

console.log(`\nWritten to ${ENV_PATH} (owner-readable only).`);
console.log('Restart the app, then press "Load models" in Settings → Models.');
