/* =============================================================================
   THE VAULT — local, durable, plain files.

   This machine is the vault. Google Drive is a mirror of it, not the other way
   round: an entry is on disk before any network call is attempted, so an
   expired token, a dead link or a closed tab can cost you a sync but never a
   memory.

   Entries are markdown with front matter — readable, greppable, and portable
   with `cp`. There is no database to corrupt and nothing to migrate.
   ========================================================================== */

import fs from 'fs/promises';
import path from 'path';

export const VAULT_DIR = process.env.VAULT_DIR
  ? path.resolve(process.env.VAULT_DIR)
  : path.join(process.cwd(), 'vault');

const AUDIO_DIR = path.join(VAULT_DIR, 'audio');
const TRASH_DIR = path.join(VAULT_DIR, '.trash');

/** The recording is the one thing that cannot be reconstructed. Kept unless
 *  VAULT_KEEP_AUDIO=off. */
export const KEEP_AUDIO = process.env.VAULT_KEEP_AUDIO !== 'off';

const ID_RE = /^\d{8}-\d{6}-[a-z0-9]{4}$/;

/** Phones do not all record the same container. Safari on iOS produces MP4,
 *  Chrome and Firefox produce WebM, and a recording saved under the wrong
 *  extension is a recording that will not play back and will not transcribe.
 *  So the container that arrived is the container that is kept. */
const AUDIO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'video/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
};

export function extForMime(mime = ''): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  return AUDIO_EXT[base] || 'webm';
}

export interface Entry {
  id: string;
  title: string;
  created: string;
  updated: string;
  indicators: string[];
  audio?: string;
  drive?: string;
  text: string;
}

export interface EntrySummary extends Omit<Entry, 'text'> {
  excerpt: string;
  words: number;
}

export function newId(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${stamp}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;
}

/** Ids reach the filesystem, so nothing that is not exactly an id gets through. */
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

export async function ensureVault(): Promise<void> {
  await fs.mkdir(VAULT_DIR, { recursive: true, mode: 0o700 });
  if (KEEP_AUDIO) await fs.mkdir(AUDIO_DIR, { recursive: true, mode: 0o700 });
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function serialize(e: Entry): string {
  const head = [
    '---',
    `id: ${e.id}`,
    `title: ${oneLine(e.title)}`,
    `created: ${e.created}`,
    `updated: ${e.updated}`,
    `indicators: ${e.indicators.join(', ')}`,
    e.audio ? `audio: ${e.audio}` : '',
    e.drive ? `drive: ${e.drive}` : '',
    '---',
  ].filter(Boolean);
  return head.join('\n') + '\n\n' + e.text.replace(/\s+$/, '') + '\n';
}

function parse(id: string, raw: string): Entry {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return {
    id: meta.id || id,
    title: meta.title || 'Untitled',
    created: meta.created || '',
    updated: meta.updated || meta.created || '',
    indicators: meta.indicators ? meta.indicators.split(',').map(s => s.trim()).filter(Boolean) : [],
    audio: meta.audio || undefined,
    drive: meta.drive || undefined,
    text: body.replace(/^\n+/, ''),
  };
}

export async function readEntry(id: string): Promise<Entry> {
  if (!isValidId(id)) throw new Error('Unknown entry.');
  const raw = await fs.readFile(path.join(VAULT_DIR, `${id}.md`), 'utf-8');
  return parse(id, raw);
}

export interface SaveInput {
  id?: string;
  title?: string;
  text?: string;
  indicators?: string[];
  audio?: string;
  drive?: string;
}

/** Write-through: an existing entry keeps every field the caller does not set,
 *  so archiving to Drive can record a link without touching the text. */
export async function saveEntry(input: SaveInput): Promise<Entry> {
  await ensureVault();
  const now = new Date().toISOString();

  let existing: Entry | null = null;
  let id = isValidId(input.id) ? input.id : '';
  if (id) existing = await readEntry(id).catch(() => null);
  if (!id) id = newId();

  const entry: Entry = {
    id,
    title: oneLine(input.title ?? existing?.title ?? '') || 'Untitled',
    created: existing?.created || now,
    updated: now,
    indicators: input.indicators ?? existing?.indicators ?? [],
    audio: input.audio ?? existing?.audio,
    drive: input.drive ?? existing?.drive,
    text: input.text ?? existing?.text ?? '',
  };

  // Write to a temp file and rename. A half-written journal entry is not a
  // thing that should be able to exist.
  const file = path.join(VAULT_DIR, `${id}.md`);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, serialize(entry), { mode: 0o600 });
  await fs.rename(tmp, file);
  return entry;
}

export async function listEntries(): Promise<EntrySummary[]> {
  await ensureVault();
  const names = await fs.readdir(VAULT_DIR).catch(() => [] as string[]);
  const entries: EntrySummary[] = [];

  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    const id = name.slice(0, -3);
    if (!isValidId(id)) continue;
    try {
      const e = await readEntry(id);
      const { text, ...rest } = e;
      entries.push({
        ...rest,
        excerpt: oneLine(text).slice(0, 160),
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
      });
    } catch {
      // A file that will not parse is still a file on disk. Skip it in the list
      // rather than failing the whole request.
    }
  }

  return entries.sort((a, b) => (a.created < b.created ? 1 : -1));
}

/** Moves the entry and its audio into .trash. Nothing here unlinks anything —
 *  a journal is not a cache. */
export async function trashEntry(id: string): Promise<void> {
  if (!isValidId(id)) throw new Error('Unknown entry.');
  await fs.mkdir(TRASH_DIR, { recursive: true, mode: 0o700 });
  const stamp = Date.now();
  await fs.rename(path.join(VAULT_DIR, `${id}.md`), path.join(TRASH_DIR, `${id}.${stamp}.md`));
  const recording = await findAudio(id);
  if (recording) {
    await fs
      .rename(recording, path.join(TRASH_DIR, `${id}.${stamp}${path.extname(recording)}`))
      .catch(() => {});
  }
}

/** Called before transcription, never after: if every model fails, the audio is
 *  still on disk and the entry can be recovered by hand. */
export async function saveAudio(id: string, buffer: Buffer, mime = ''): Promise<string | undefined> {
  if (!KEEP_AUDIO || !isValidId(id)) return undefined;
  await ensureVault();
  const rel = path.posix.join('audio', `${id}.${extForMime(mime)}`);
  await fs.writeFile(path.join(VAULT_DIR, rel), buffer, { mode: 0o600 });
  return rel;
}

/** Older entries were all .webm and have no extension recorded; anything on
 *  disk for this id will do. */
export async function findAudio(id: string): Promise<string | null> {
  if (!isValidId(id)) return null;
  const names = await fs.readdir(AUDIO_DIR).catch(() => [] as string[]);
  const hit = names.find(n => n.startsWith(`${id}.`));
  return hit ? path.join(AUDIO_DIR, hit) : null;
}
