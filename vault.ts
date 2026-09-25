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

/** One named pattern, as stored. Only the term id and the words it was drawn
 *  from are kept: the label, category and definition all come from the
 *  vocabulary at read time, so editing a definition updates every entry rather
 *  than leaving thousands of stale copies on disk. */
export interface StoredIndicator {
  id: string;
  evidence?: string;
}

/** When the thing actually happened, as opposed to when it was written down.
 *
 *  `text` is the only field the writer is asked for, and it is kept verbatim:
 *  "around when we moved", "the summer before school". That is usually the
 *  truest thing available, and it is what gets displayed.
 *
 *  `start`/`end` are a RANGE a model inferred so that entries can be put in
 *  order. A whole year is a legitimate answer. They are never shown as if they
 *  were facts, and never overwrite `text`.
 *
 *  Dates are ISO and may be partial: "2009", "2009-06", "2009-06-14". */
export interface Occurred {
  text?: string;
  start?: string;
  end?: string;
  /** stated  - the writer gave a date
   *  anchored - placed relative to another entry the writer did date
   *  inferred - a model's guess from context
   *  unknown  - nothing to go on yet */
  confidence?: 'stated' | 'anchored' | 'inferred' | 'unknown';
}

export interface Entry {
  id: string;
  title: string;
  created: string;
  updated: string;
  /** Labels, kept for a human reading the file and for anything that already
   *  parsed this field. The evidence lives in `found`. */
  indicators: string[];
  found: StoredIndicator[];
  occurred: Occurred;
  audio?: string;
  drive?: string;
  /** The entry rendered in English, when the original is not. The original is
   *  never replaced — testimony is the words that were actually used. */
  english?: string;
  /** The raw transcript, when the text above is a cleaned version of it.
   *  Same principle as `english`: the tidier version is the convenience, and
   *  the words actually spoken stay on disk. */
  verbatim?: string;
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
  const o = e.occurred || {};
  const head = [
    '---',
    `id: ${e.id}`,
    `title: ${oneLine(e.title)}`,
    `created: ${e.created}`,
    `updated: ${e.updated}`,
    // When it happened. Written as separate lines rather than one blob so that
    // a person editing this file by hand can fix a range without touching JSON.
    o.text ? `when: ${oneLine(o.text)}` : '',
    o.start ? `when_start: ${o.start}` : '',
    o.end ? `when_end: ${o.end}` : '',
    o.confidence ? `when_confidence: ${o.confidence}` : '',
    `indicators: ${e.indicators.join(', ')}`,
    // The quotes, as one JSON line. Ugly beside the rest, and still the right
    // call: an evidence quote can contain commas, colons and newlines, which a
    // naive key: value line cannot survive.
    e.found?.length ? `found: ${JSON.stringify(e.found)}` : '',
    e.verbatim ? `verbatim: ${JSON.stringify(e.verbatim)}` : '',
    e.audio ? `audio: ${e.audio}` : '',
    e.drive ? `drive: ${e.drive}` : '',
    '---',
  ].filter(Boolean);

  const body = e.english
    ? `${e.text.replace(/\s+$/, '')}\n\n---\n\n## In English\n\n${e.english.replace(/\s+$/, '')}`
    : e.text.replace(/\s+$/, '');

  return head.join('\n') + '\n\n' + body + '\n';
}

/** The English rendering is appended under a heading rather than kept in front
 *  matter, so the file still reads as a document. Splitting it back off has to
 *  be exact, or a translation would slowly eat the original. */
const ENGLISH_MARK = '\n\n---\n\n## In English\n\n';

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
  let found: StoredIndicator[] = [];
  if (meta.found) {
    try {
      const parsed = JSON.parse(meta.found);
      if (Array.isArray(parsed)) {
        found = parsed.filter(r => r && typeof r.id === 'string');
      }
    } catch {
      // A hand-edited file that no longer parses should cost the quotes, not
      // the entry.
    }
  }

  let text = body.replace(/^\n+/, '');
  let english: string | undefined;
  const cut = text.indexOf(ENGLISH_MARK);
  if (cut >= 0) {
    english = text.slice(cut + ENGLISH_MARK.length).replace(/\s+$/, '');
    text = text.slice(0, cut);
  }
  // serialize() trims trailing whitespace and ends the file with a newline;
  // undo exactly that, or every read hands back text one newline longer than
  // was saved (caught by tests/vault.test.ts).
  text = text.replace(/\s+$/, '');

  const confidence = ['stated', 'anchored', 'inferred', 'unknown'].includes(meta.when_confidence)
    ? (meta.when_confidence as Occurred['confidence'])
    : undefined;

  return {
    id: meta.id || id,
    title: meta.title || 'Untitled',
    created: meta.created || '',
    updated: meta.updated || meta.created || '',
    indicators: meta.indicators ? meta.indicators.split(',').map(s => s.trim()).filter(Boolean) : [],
    found,
    occurred: {
      text: meta.when || undefined,
      start: meta.when_start || undefined,
      end: meta.when_end || undefined,
      confidence,
    },
    audio: meta.audio || undefined,
    drive: meta.drive || undefined,
    english,
    // JSON-encoded on one line: a spoken transcript is full of the commas and
    // colons a naive key: value line cannot survive.
    verbatim: (() => {
      if (!meta.verbatim) return undefined;
      try {
        return JSON.parse(meta.verbatim);
      } catch {
        return meta.verbatim;
      }
    })(),
    text,
  };
}

/** Where an entry sits on the timeline. A range collapses to its midpoint, a
 *  partial date to its own midpoint ("2009" is the middle of 2009), and an
 *  entry with no "when" at all falls back to when it was written — which is
 *  wrong, but is the only thing there is, and the interface says so. */
export function timelineKey(e: { occurred?: Occurred; created: string }): number {
  const at = (d?: string, end = false): number | null => {
    if (!d) return null;
    const m = d.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
    if (!m) {
      const t = Date.parse(d);
      return Number.isNaN(t) ? null : t;
    }
    const [, y, mo, da] = m;
    if (da) return Date.UTC(+y, +mo - 1, +da);
    if (mo) return end ? Date.UTC(+y, +mo, 0) : Date.UTC(+y, +mo - 1, 1);
    return end ? Date.UTC(+y, 11, 31) : Date.UTC(+y, 0, 1);
  };

  const s = at(e.occurred?.start);
  const t = at(e.occurred?.end, true);
  if (s !== null && t !== null) return (s + t) / 2;
  if (s !== null) return s;
  if (t !== null) return t;
  return Date.parse(e.created) || 0;
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
  found?: StoredIndicator[];
  occurred?: Occurred;
  english?: string;
  verbatim?: string;
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
    found: input.found ?? existing?.found ?? [],
    // Merged rather than replaced: a model filling in a range must not wipe the
    // words the writer typed, and the writer correcting the words must not wipe
    // the range.
    occurred: { ...(existing?.occurred || {}), ...(input.occurred || {}) },
    english: input.english ?? existing?.english,
    verbatim: input.verbatim ?? existing?.verbatim,
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

  // Newest first, but by when it HAPPENED. An entry nobody has dated yet
  // falls back to when it was written, which is the only thing available.
  return entries.sort((a, b) => timelineKey(b) - timelineKey(a));
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
