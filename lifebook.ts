/* =============================================================================
   LIFE BOOK — from entries to a life story, in the writer's own voice.

   Three things on disk, all plain markdown (the vault is the product):

     vault/life/map.md      the periods of the life, the people and places, and
                            which periods are covered and which are thin
     vault/life/style.md    how the writer talks, learned from their own words
     vault/book/<slug>.md   one chapter per period, first person, every
                            paragraph citing the entries it came from

   map.json beside map.md is what the code reads back; map.md is for the
   writer. Nothing here invents: a chapter is drafted by the same citing,
   no-additions machinery as every other chapter (episodes.ts), and a period
   is redrafted only when one of its entries has changed.
   ========================================================================== */

import fs from 'node:fs/promises';
import path from 'node:path';
import { VAULT_DIR, isValidId, readEntry, listEntries, type Entry } from './vault.ts';
import { chat } from './providers.ts';
import { draftEpisode, render } from './episodes.ts';
import { planParts, estimateTokens, PART_TOKENS } from './chapters.ts';

const LIFE_DIR = path.join(VAULT_DIR, 'life');
const BOOK_DIR = path.join(VAULT_DIR, 'book');
const MAP_JSON = path.join(LIFE_DIR, 'map.json');
const MAP_MD = path.join(LIFE_DIR, 'map.md');
const STYLE_MD = path.join(LIFE_DIR, 'style.md');

/** Fewer words than this in a period, and it is "thin". */
export const THIN_WORDS = 600;
const EXCERPT = 360;

export interface Period {
  slug: string;
  name: string;
  /** In the writer's terms: "1985–1992", "primary school". */
  years: string;
  summary: string;
  entries: string[];
}

export interface LifeMap {
  updated: string;
  periods: Period[];
  people: { name: string; who: string }[];
  places: string[];
}

export const slugify = (name: string): string =>
  name
    .toLocaleLowerCase('el')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'period';

export function isSlug(s: unknown): s is string {
  return typeof s === 'string' && /^[\p{L}\p{N}-]{1,48}$/u.test(s) && !s.includes('..');
}

async function atomic(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, text, 'utf8');
  await fs.rename(`${file}.tmp`, file);
}

/* ---- the map ------------------------------------------------------------ */

export async function readMap(): Promise<LifeMap | null> {
  try {
    return JSON.parse(await fs.readFile(MAP_JSON, 'utf8'));
  } catch {
    return null;
  }
}

/** Words in a period's entries, and whether that is thin. */
export async function coverage(p: Period): Promise<{ words: number; thin: boolean }> {
  let words = 0;
  for (const id of p.entries) {
    try {
      const t = (await readEntry(id)).text.trim();
      if (t) words += t.split(/\s+/).length;
    } catch {}
  }
  return { words, thin: words < THIN_WORDS || p.entries.length < 2 };
}

export async function renderMap(m: LifeMap): Promise<string> {
  const out = ['# My life, as far as I have told it', '', `_Updated ${m.updated.slice(0, 10)}_`, '', '## Periods', ''];
  for (const p of m.periods) {
    const c = await coverage(p);
    out.push(`### ${p.name}${p.years ? ` (${p.years})` : ''} — ${c.thin ? '**thin**' : 'covered'}`);
    out.push('', p.summary || '', '', `${p.entries.length} entries, ${c.words} words.`, '');
  }
  if (m.people.length) out.push('## People', '', ...m.people.map(x => `- **${x.name}** — ${x.who}`), '');
  if (m.places.length) out.push('## Places', '', ...m.places.map(x => `- ${x}`), '');
  return out.join('\n');
}

async function saveMap(m: LifeMap): Promise<void> {
  await atomic(MAP_JSON, JSON.stringify(m, null, 1));
  await atomic(MAP_MD, await renderMap(m));
}

function parseJson(raw: string): any {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const span = t.match(/\{[\s\S]*\}/);
  return JSON.parse(span ? span[0] : t);
}

/** Builds (or extends) the map from the entries. Entries go to the model a
 *  budget's worth at a time; each batch sees the periods named so far, so the
 *  same stretch of life keeps one name. Only real entry ids survive. */
export async function buildMap(config: Record<string, string>): Promise<LifeMap> {
  const list = (await listEntries()).filter(e => e.words > 0);
  if (list.length === 0) throw new Error('There are no entries with words yet.');
  const ordered = [...list].sort((a, b) => (a.occurred?.start || a.created).localeCompare(b.occurred?.start || b.created));
  const lines = await Promise.all(
    ordered.map(async e => {
      const text = (await readEntry(e.id)).text.replace(/\s+/g, ' ').trim();
      const when = e.occurred?.text || e.occurred?.start || 'not placed in time';
      return `${e.id} | ${when} | ${e.title} | ${text.slice(0, EXCERPT)}`;
    }),
  );
  const batches = planParts(
    ordered.map(e => e.id),
    lines,
    PART_TOKENS,
  );

  const periods = new Map<string, Period>();
  const people = new Map<string, string>();
  const places = new Set<string>();
  const real = new Set(ordered.map(e => e.id));
  let at = 0;

  for (const ids of batches) {
    const chunk = lines.slice(at, at + ids.length);
    at += ids.length;
    const known = [...periods.values()].map(p => `- ${p.name}${p.years ? ` (${p.years})` : ''}`).join('\n');
    const prompt = `You are organising someone's own journal entries into the periods of their life, so they can see what they have told and what they have not. Use ONLY what the lines say.

Each line is: entry id | when it happened | title | the start of the entry.

Return JSON only:
{"periods":[{"name":"short name in the language of the entries","years":"as they say it, or empty","summary":"one plain sentence from the lines","entries":["<entry id>", ...]}],
 "people":[{"name":"...","who":"how the writer describes them, a few words"}],
 "places":["..."]}

Rules: every entry id goes in exactly one period. Periods are stretches of life (childhood, a school, a job, a relationship, a move), in time order, not themes. Entries not placed in time go with the period their content points to, or into "Not yet placed". Do not diagnose anyone. Do not invent people, places or dates.
${known ? `\nPeriods already named (reuse these names for the same stretch of life):\n${known}\n` : ''}
Entries:
${chunk.join('\n')}`;
    const result = await chat(config, {
      task: 'synthesis',
      prompt,
      temperature: 0.1,
      json: true,
      validate: (t: string) => {
        try {
          return Array.isArray(parseJson(t).periods);
        } catch {
          return false;
        }
      },
    });
    const data = parseJson(result.text);
    for (const p of data.periods || []) {
      const name = String(p?.name || '').trim().slice(0, 80);
      if (!name) continue;
      const key = slugify(name);
      const have = periods.get(key) || { slug: key, name, years: '', summary: '', entries: [] };
      have.years = have.years || String(p.years || '').trim().slice(0, 40);
      have.summary = have.summary || String(p.summary || '').trim().slice(0, 300);
      for (const id of Array.isArray(p.entries) ? p.entries : []) {
        if (real.has(id) && !have.entries.includes(id)) have.entries.push(id);
      }
      periods.set(key, have);
    }
    for (const x of data.people || []) if (x?.name) people.set(String(x.name).trim().slice(0, 60), String(x.who || '').trim().slice(0, 120));
    for (const x of data.places || []) if (x) places.add(String(x).trim().slice(0, 80));
  }

  // Any entry the model left out still belongs somewhere visible.
  const placed = new Set([...periods.values()].flatMap(p => p.entries));
  const missing = ordered.map(e => e.id).filter(id => !placed.has(id));
  if (missing.length) {
    const key = 'not-yet-placed';
    const have = periods.get(key) || { slug: key, name: 'Not yet placed', years: '', summary: 'Entries not yet fitted to a period.', entries: [] };
    have.entries.push(...missing);
    periods.set(key, have);
  }

  const map: LifeMap = {
    updated: new Date().toISOString(),
    periods: [...periods.values()].filter(p => p.entries.length),
    people: [...people].map(([name, who]) => ({ name, who })),
    places: [...places],
  };
  await saveMap(map);
  return map;
}

/** Names of the thin periods, for the interviewer's "suggest topics". */
export async function thinPeriods(): Promise<string[]> {
  const m = await readMap();
  if (!m) return [];
  const out: string[] = [];
  for (const p of m.periods) if ((await coverage(p)).thin) out.push(p.years ? `${p.name} (${p.years})` : p.name);
  return out;
}

/* ---- the style ---------------------------------------------------------- */

export async function readStyle(): Promise<string> {
  try {
    return (await fs.readFile(STYLE_MD, 'utf8')).trim();
  } catch {
    return '';
  }
}

/** A short guide to how the writer talks, from what they actually said. The
 *  verbatim text is preferred: the tidied copy has already lost the voice. */
export async function learnStyle(config: Record<string, string>): Promise<string> {
  const list = (await listEntries()).filter(e => e.words > 0);
  if (list.length === 0) throw new Error('There are no entries with words yet.');
  const samples: string[] = [];
  let used = 0;
  for (const e of [...list].sort(() => 0.5 - Math.random())) {
    const full = await readEntry(e.id);
    const said = (full.verbatim || full.text).replace(/\s+/g, ' ').trim().slice(0, 900);
    if (!said) continue;
    samples.push(said);
    used += said.length;
    if (used > 9000) break;
  }
  const prompt = `Below are things one person said aloud about their own life. Write a short STYLE GUIDE (at most 12 bullet points) so that a chapter written for them sounds like THEM and not like a book. Describe only what is visible in the samples: language(s) and how they mix, sentence length, how direct or restrained they are, words and phrases they return to, how they talk about other people, what they leave unsaid, how they start and end a thought. Quote short examples in their own words. Do not describe their personality or feelings. Do not judge.

Samples:
${samples.map((s, i) => `(${i + 1}) ${s}`).join('\n\n')}`;
  const result = await chat(config, { task: 'synthesis', prompt, temperature: 0.2 });
  const guide = result.text.trim();
  await atomic(STYLE_MD, `# How I talk\n\n_Learned from ${samples.length} of my entries, ${new Date().toISOString().slice(0, 10)}. Edit freely; chapters follow this._\n\n${guide}\n`);
  return guide;
}

/* ---- the book ----------------------------------------------------------- */

export interface BookChapter {
  slug: string;
  title: string;
  /** Entries the text was drafted from, with the 'updated' stamp each had. */
  sources: Record<string, string>;
  status: 'partial' | 'complete';
  parts: number;
  done: number;
  drafted: string;
  text: string;
}

function serializeChapter(c: BookChapter): string {
  return [
    '---',
    `title: ${JSON.stringify(c.title)}`,
    `status: ${c.status}`,
    `parts: ${c.parts}`,
    `done: ${c.done}`,
    `drafted: ${c.drafted}`,
    `sources: ${JSON.stringify(c.sources)}`,
    '---',
    '',
    `# ${c.title}`,
    '',
    c.text.trim(),
    '',
  ].join('\n');
}

function parseChapter(slug: string, raw: string): BookChapter {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta: Record<string, string> = {};
  for (const line of (m ? m[1] : '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  const body = (m ? m[2] : raw).replace(/^\s*# .*\n/, '').trim();
  let sources: Record<string, string> = {};
  try {
    sources = JSON.parse(meta.sources || '{}');
  } catch {}
  let title = slug;
  try {
    title = JSON.parse(meta.title || '""') || slug;
  } catch {}
  return {
    slug,
    title,
    sources,
    status: meta.status === 'complete' ? 'complete' : 'partial',
    parts: Number(meta.parts) || 1,
    done: Number(meta.done) || 0,
    drafted: meta.drafted || '',
    text: body,
  };
}

export async function readChapterFile(slug: string): Promise<BookChapter | null> {
  if (!isSlug(slug)) return null;
  try {
    return parseChapter(slug, await fs.readFile(path.join(BOOK_DIR, `${slug}.md`), 'utf8'));
  } catch {
    return null;
  }
}

export interface BookRow {
  slug: string;
  name: string;
  years: string;
  entries: number;
  words: number;
  thin: boolean;
  drafted: boolean;
  /** An entry changed (or was added) since this chapter was drafted. */
  stale: boolean;
  partial: boolean;
}

/** Fingerprint of the entries a period is made of right now. */
async function fingerprint(p: Period): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of p.entries) {
    try {
      out[id] = (await readEntry(id)).updated;
    } catch {}
  }
  return out;
}

export async function bookStatus(): Promise<{ map: LifeMap | null; rows: BookRow[]; style: boolean }> {
  const map = await readMap();
  const rows: BookRow[] = [];
  for (const p of map?.periods || []) {
    const c = await coverage(p);
    const ch = await readChapterFile(p.slug);
    const now = await fingerprint(p);
    const same = ch && Object.keys(now).length === Object.keys(ch.sources).length && Object.entries(now).every(([id, u]) => ch.sources[id] === u);
    rows.push({
      slug: p.slug,
      name: p.name,
      years: p.years,
      entries: p.entries.length,
      words: c.words,
      thin: c.thin,
      drafted: Boolean(ch && ch.text),
      stale: Boolean(ch && ch.text && !same),
      partial: ch?.status === 'partial',
    });
  }
  return { map, rows, style: Boolean(await readStyle()) };
}

/** Drafts one period's chapter, a budget's worth of entries at a time, saving
 *  after every part so nothing already written is lost. */
export async function draftPeriod(config: Record<string, string>, slug: string): Promise<BookChapter> {
  const map = await readMap();
  const period = map?.periods.find(p => p.slug === slug);
  if (!period) throw new Error('That period is not on the map. Build the map first.');
  const entries: Entry[] = [];
  for (const id of period.entries) {
    if (!isValidId(id)) continue;
    try {
      const e = await readEntry(id);
      if (e.text.trim()) entries.push(e);
    } catch {}
  }
  if (entries.length === 0) throw new Error('This period has no entries with words yet.');
  entries.sort((a, b) => (a.occurred?.start || a.created).localeCompare(b.occurred?.start || b.created));

  const style = (await readStyle()) || 'Plain, direct, short sentences. Keep their own words.';
  const rendered = await Promise.all(entries.map(render));
  const plan = planParts(
    entries.map(e => e.id),
    rendered,
    PART_TOKENS,
  );
  const byId = new Map(entries.map(e => [e.id, e]));
  const sources = await fingerprint(period);
  let title = period.name;
  let text = '';
  const base: BookChapter = { slug, title, sources, status: 'partial', parts: plan.length, done: 0, drafted: new Date().toISOString(), text: '' };

  for (let i = 0; i < plan.length; i++) {
    const draft = await draftEpisode(config, plan[i].map(id => byId.get(id)!), {
      focus: period.name + (period.years ? ` (${period.years})` : ''),
      firstPerson: { style },
      part: { index: i, total: plan.length, title: i > 0 ? title : undefined, previousTail: text.slice(-600) || undefined },
    });
    if (i === 0 && draft.title && draft.title !== 'Untitled chapter') title = draft.title;
    text = text ? `${text}\n\n${draft.text}` : draft.text;
    await atomic(
      path.join(BOOK_DIR, `${slug}.md`),
      serializeChapter({ ...base, title, text, done: i + 1, status: i + 1 === plan.length ? 'complete' : 'partial' }),
    );
  }
  return (await readChapterFile(slug))!;
}

/** The text of a chapter without its citations, for reading aloud. */
export function stripCitations(text: string): string {
  return text
    // One id, or several in one bracket ("[a, b]").
    .replace(/ ?\[(?:[0-9]{8}-[0-9]{6}-[a-z0-9]{3,6}[,;\s]*)+\]/g, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export { estimateTokens };
