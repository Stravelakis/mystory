/* =============================================================================
   CHAPTERS — an episode drafted in parts, each part saved the moment it lands.

   A chapter over many entries can outgrow one model call: the Live models
   allow 65k tokens a minute and spend ~2,600 of every call on Google's own
   preamble. Rather than let a long chapter quietly fall back to a smaller
   model, the entries are split into parts that fit, drafted one at a time,
   and written to disk as each finishes. A failure costs the part in flight,
   never the parts before it, and drafting again resumes where it stopped.

   Stored as vault/chapters/<id>.md — plain markdown like everything else:

     ---
     id: c-3f9a1b2c4d
     title: The summer we moved
     entries: ["2026…", …]
     plan: [["2026…"], ["2026…", "2026…"]]
     updated: 2026-09-25T…
     ---
     <!-- part 1 -->
     …
     <!-- part 2 -->
     …
   ========================================================================== */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { VAULT_DIR, ensureVault } from './vault.ts';

const CHAPTER_DIR = path.join(VAULT_DIR, 'chapters');
const TRASH_DIR = path.join(VAULT_DIR, '.trash');
const CHAPTER_ID_RE = /^c-[0-9a-f]{10}$/;

/** Entry text allowed into one part, in estimated tokens. Greek costs more
 *  tokens per character than English, so the estimate is deliberately
 *  pessimistic (a token per 3 characters). */
export const PART_TOKENS = Number(process.env.EPISODE_PART_TOKENS || 12_000);

export interface Chapter {
  id: string;
  title: string;
  entries: string[];
  /** The entry ids in each part, in order. */
  plan: string[][];
  /** Drafted text per part; a missing part is an empty string. */
  parts: string[];
  updated: string;
}

export function isChapterId(id: unknown): id is string {
  return typeof id === 'string' && CHAPTER_ID_RE.test(id);
}

/** The same set of entries is the same chapter, whatever order they came in. */
export function chapterId(entryIds: string[]): string {
  const h = crypto.createHash('sha1').update([...entryIds].sort().join('\n')).digest('hex');
  return `c-${h.slice(0, 10)}`;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** Greedy split, in order. An entry bigger than the budget on its own still
 *  gets a part of its own: a long entry is not one to leave out. */
export function planParts(ids: string[], rendered: string[], budget = PART_TOKENS): string[][] {
  const parts: string[][] = [];
  let current: string[] = [];
  let used = 0;
  ids.forEach((id, i) => {
    const cost = estimateTokens(rendered[i]);
    if (current.length > 0 && used + cost > budget) {
      parts.push(current);
      current = [];
      used = 0;
    }
    current.push(id);
    used += cost;
  });
  if (current.length) parts.push(current);
  return parts;
}

function serialize(c: Chapter): string {
  const head = [
    '---',
    `id: ${c.id}`,
    `title: ${JSON.stringify(c.title)}`,
    `entries: ${JSON.stringify(c.entries)}`,
    `plan: ${JSON.stringify(c.plan)}`,
    `updated: ${c.updated}`,
    '---',
    '',
  ].join('\n');
  const body = c.parts.map((t, i) => `<!-- part ${i + 1} -->\n${t.trim()}\n`).join('\n');
  return head + body;
}

function parse(raw: string): Chapter {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('Not a chapter file.');
  const field = (name: string) => m[1].match(new RegExp(`^${name}: (.*)$`, 'm'))?.[1] ?? '';
  const plan: string[][] = JSON.parse(field('plan') || '[]');
  const parts = plan.map(() => '');
  for (const [, n, text] of m[2].matchAll(/^<!-- part (\d+) -->\n([\s\S]*?)(?=^<!-- part \d+ -->|(?![\s\S]))/gm)) {
    const i = Number(n) - 1;
    if (i >= 0 && i < parts.length) parts[i] = text.trim();
  }
  let title = field('title');
  try {
    title = JSON.parse(title);
  } catch {}
  return {
    id: field('id'),
    title,
    entries: JSON.parse(field('entries') || '[]'),
    plan,
    parts,
    updated: field('updated'),
  };
}

async function write(c: Chapter): Promise<void> {
  await ensureVault();
  await fs.mkdir(CHAPTER_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(CHAPTER_DIR, `${c.id}.md`);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, serialize(c), { mode: 0o600 });
  await fs.rename(tmp, file);
}

export async function readChapter(id: string): Promise<Chapter | null> {
  if (!isChapterId(id)) return null;
  try {
    return parse(await fs.readFile(path.join(CHAPTER_DIR, `${id}.md`), 'utf-8'));
  } catch {
    return null;
  }
}

export async function listChapters(): Promise<(Omit<Chapter, 'parts'> & { done: number })[]> {
  const names = await fs.readdir(CHAPTER_DIR).catch(() => [] as string[]);
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.md')) continue;
    const c = await readChapter(n.slice(0, -3));
    if (!c) continue;
    const { parts, ...rest } = c;
    out.push({ ...rest, done: parts.filter(Boolean).length });
  }
  return out.sort((a, b) => b.updated.localeCompare(a.updated));
}

/** Opens the chapter for this plan, keeping any parts already drafted. If the
 *  entries were split differently last time (an entry was edited and grew,
 *  or the budget changed), the old file goes to .trash — never deleted — and
 *  drafting starts over. */
export async function openChapter(entries: string[], plan: string[][]): Promise<Chapter> {
  const id = chapterId(entries);
  const existing = await readChapter(id);
  if (existing && JSON.stringify(existing.plan) === JSON.stringify(plan)) return existing;

  if (existing) {
    await fs.mkdir(TRASH_DIR, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.rename(path.join(CHAPTER_DIR, `${id}.md`), path.join(TRASH_DIR, `chapter-${id}.${stamp}.md`));
  }
  const fresh: Chapter = {
    id,
    title: '',
    entries,
    plan,
    parts: plan.map(() => ''),
    updated: new Date().toISOString(),
  };
  await write(fresh);
  return fresh;
}

export async function savePart(id: string, index: number, text: string, title?: string): Promise<Chapter> {
  const c = await readChapter(id);
  if (!c) throw new Error('That chapter is not in the vault.');
  if (index < 0 || index >= c.plan.length) throw new Error('That chapter has no such part.');
  c.parts[index] = text;
  if (title && !c.title) c.title = title;
  c.updated = new Date().toISOString();
  await write(c);
  return c;
}
