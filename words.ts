/* =============================================================================
   MY WORDS — the names and words a transcriber cannot know.

   Speech recognition has never heard your sister's nickname, your village,
   or the word your family used for the thing nobody talked about. It hears
   them as something else, every time. This list is handed to every engine
   that can take a hint, and to the tidying pass, which is allowed to correct
   a word ONLY to one on this list and only when it clearly sounds the same.

   Stored as vault/words.md, a plain list that travels with the vault:

     # My words
     - Σταυρούλα — my sister, "Βούλα" at home
     - Κιλκίς
     - gaslighting
   ========================================================================== */

import fs from 'node:fs/promises';
import path from 'node:path';
import { VAULT_DIR, ensureVault } from './vault.ts';

const WORDS_FILE = path.join(VAULT_DIR, 'words.md');

export interface MyWord {
  term: string;
  /** Who or what it is, in the writer's words. Helps the tidying pass. */
  note?: string;
}

const MAX_WORDS = 500;
const MAX_TERM = 80;
const MAX_NOTE = 200;

export function parseWords(md: string): MyWord[] {
  const out: MyWord[] = [];
  const seen = new Set<string>();
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (!m) continue;
    const [term, ...rest] = m[1].split(/\s+—\s+/);
    const t = term.trim().slice(0, MAX_TERM);
    const key = t.toLocaleLowerCase('el');
    if (!t || seen.has(key)) continue;
    seen.add(key);
    const note = rest.join(' — ').trim().slice(0, MAX_NOTE);
    out.push(note ? { term: t, note } : { term: t });
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

export function serializeWords(words: MyWord[]): string {
  const lines = words.map(w => `- ${w.term}${w.note ? ` — ${w.note}` : ''}`);
  return `# My words\n\nNames and words the transcriber should know. One per line; anything after " — " is a note.\n\n${lines.join('\n')}\n`;
}

/** Cleans whatever the client sent: trims, caps lengths, drops duplicates. */
export function cleanWords(raw: unknown): MyWord[] {
  if (!Array.isArray(raw)) return [];
  const md = raw
    .map((w: any) => {
      const term = String(w?.term ?? w ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+—\s+/g, ' - ').trim();
      const note = String(w?.note ?? '').replace(/[\r\n]+/g, ' ').trim();
      return term ? `- ${term}${note ? ` — ${note}` : ''}` : '';
    })
    .join('\n');
  return parseWords(md);
}

export async function loadWords(): Promise<MyWord[]> {
  try {
    return parseWords(await fs.readFile(WORDS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export async function saveWords(words: MyWord[]): Promise<MyWord[]> {
  await ensureVault();
  const clean = cleanWords(words);
  const tmp = `${WORDS_FILE}.tmp`;
  await fs.writeFile(tmp, serializeWords(clean), { mode: 0o600 });
  await fs.rename(tmp, WORDS_FILE);
  return clean;
}

/** The list as a hint for a transcriber, cut to fit. Whisper-style prompts
 *  only look at the last ~224 tokens, so short models get a short list. */
export function wordsHint(words: MyWord[], maxChars = 1500): string {
  if (words.length === 0) return '';
  let out = '';
  for (const w of words) {
    const next = out ? `${out}, ${w.term}` : w.term;
    if (next.length > maxChars) break;
    out = next;
  }
  return out;
}

/** Terms a model suggested, kept only if they really occur in the text they
 *  were drawn from — the same rule as indicator evidence. A suggested name
 *  that is not in your entries is a name the model made up. */
export function keepIfPresent(suggested: unknown, corpus: string, existing: MyWord[]): MyWord[] {
  const hay = corpus.toLocaleLowerCase('el');
  const have = new Set(existing.map(w => w.term.toLocaleLowerCase('el')));
  const rows: any[] = Array.isArray(suggested) ? suggested : Array.isArray((suggested as any)?.words) ? (suggested as any).words : [];
  const out: MyWord[] = [];
  for (const r of rows) {
    const term = String(r?.term ?? r ?? '').trim().slice(0, MAX_TERM);
    const key = term.toLocaleLowerCase('el');
    if (term.length < 2 || have.has(key) || !hay.includes(key)) continue;
    have.add(key);
    const note = String(r?.why ?? r?.note ?? '').trim().slice(0, MAX_NOTE);
    out.push(note ? { term, note } : { term });
  }
  return out;
}
