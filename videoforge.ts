/* =============================================================================
   VIDEO-FORGE EXPORT — a story out as the two files Video-Forge reads.

   Video-Forge (DnD-World/Video-Forge) is never changed and never called. This
   module only writes what it already accepts:

     <name>.txt   the script. Since its DramaBox change a script IS the engine's
                  prompt: blank-line-separated blocks, each opening with the
                  speaker's phrase, the speech inside "double quotes".
                  (electron/tts/checkScript.ts, src/lib/narration/
                  parseDramaboxScript.ts. The older "Name: text" format in its
                  docs no longer parses.)
     <name>.json  the job (BatchJob in electron/batch/runJob.ts). The cast,
                  preset and look can only come from the writer's own job, so
                  they upload one once and every export is a copy of it with the
                  script, language and topic changed.

   Things copied from a template job are NOT copied when they belong to the
   template's own script: dramaboxWavDir and dramaboxWordsPath point at audio
   already rendered for it, and would silently narrate the wrong text.
   ========================================================================== */

import fs from 'node:fs/promises';
import path from 'node:path';
import { VAULT_DIR } from './vault.ts';
import { stripCitations } from './lifebook.ts';

const TEMPLATE = path.join(VAULT_DIR, 'export', 'job-template.json');

/** Fields that belong to the template's own script, never to a new one. */
const SCRIPT_BOUND = ['dramaboxWavDir', 'dramaboxWordsPath', 'dumpNarrationMeta', 'scriptPath', 'topic', 'language', 'backgrounds'] as const;

/** One generation holds about this much speech (101.1 blocks run 250–450). */
const BLOCK_CHARS = 330;
const MAX_SENTENCE = 460;

/** Stage directions: none names a job (Video-Forge speaks job words aloud),
 *  none names a noise, all describe how the line is said. */
const DIRECTIONS = ['speaks evenly', 'speaks quietly', 'speaks slowly', 'speaks softly', 'speaks calmly', 'speaks steadily'];

export interface JobTemplate {
  cast: { label: string; openingPhrase?: string; [k: string]: unknown }[];
  scriptPath?: string;
  [k: string]: unknown;
}

export async function readTemplate(): Promise<JobTemplate | null> {
  try {
    return JSON.parse(await fs.readFile(TEMPLATE, 'utf8'));
  } catch {
    return null;
  }
}

/** Accepts a Video-Forge job file as the writer has it. Nothing is executed or
 *  followed: it is only parsed, and only the fields below are ever used. */
export async function saveTemplate(raw: unknown): Promise<JobTemplate> {
  const job: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!job || typeof job !== 'object' || !Array.isArray(job.cast) || job.cast.length === 0) {
    throw new Error('That is not a Video-Forge job: it has no "cast". Upload one of the .json files from its jobs folder, for example 101.1-final.json.');
  }
  for (const c of job.cast) {
    if (!c || typeof c.label !== 'string' || !c.label.trim()) throw new Error('Every cast member in a job needs a "label".');
  }
  await fs.mkdir(path.dirname(TEMPLATE), { recursive: true });
  await fs.writeFile(`${TEMPLATE}.tmp`, JSON.stringify(job, null, 2), 'utf8');
  await fs.rename(`${TEMPLATE}.tmp`, TEMPLATE);
  return job;
}

/* ---- the script --------------------------------------------------------- */

export function languageOfText(text: string): 'el' | 'en' {
  const greek = (text.match(/[Ͱ-Ͽἀ-῿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return greek >= latin ? 'el' : 'en';
}

/** Markdown and citations out; what is left is what a voice should say. */
export function plainSpeech(md: string): string {
  return stripCitations(md)
    .replace(/^---[\s\S]*?\n---\n/, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/[*_`>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Straight and curly double quotes would end the speech early. Greek « » are
 *  what Video-Forge's own checker recommends. */
function safeQuotes(s: string): string {
  return s
    .replace(/(^|[\s(\[—-])["“]/g, '$1«')
    .replace(/["”]/g, '»')
    .replace(/[“”]/g, '»');
}

export function sentences(paragraph: string, lang: 'el' | 'en'): string[] {
  const enders = lang === 'el' ? '.!?;…' : '.!?…';
  const re = new RegExp(`(?<=[${enders.replace(/[\]\\^-]/g, '\\$&')}][»"')]?)\\s+(?=[\\p{Lu}«"“0-9])`, 'u');
  const out: string[] = [];
  for (const s of paragraph.replace(/\s+/g, ' ').trim().split(re)) {
    const t = s.trim();
    if (!t) continue;
    if (t.length <= MAX_SENTENCE) out.push(t);
    else out.push(...splitLong(t));
  }
  return out;
}

/** A sentence longer than a generation holds, cut at the comma nearest the middle. */
function splitLong(s: string): string[] {
  if (s.length <= MAX_SENTENCE) return [s];
  const mid = s.length / 2;
  let best = -1;
  for (let i = 0; i < s.length; i++) if (/[,:—]/.test(s[i]) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  if (best < 0) {
    const sp = s.lastIndexOf(' ', Math.floor(mid));
    best = sp > 0 ? sp : Math.floor(mid);
  }
  const head = s.slice(0, best + 1).trim();
  const tail = s.slice(best + 1).trim();
  return [...splitLong(head), ...splitLong(tail)].filter(Boolean);
}

export interface ScriptResult {
  script: string;
  blocks: number;
  words: number;
  warnings: string[];
}

/** Video-Forge speaks job words aloud and cannot say these noises; they are
 *  reported, not silently changed: they are the writer's words. */
const DEAD_PHONETIC = /Χαχα|Χεχε|Μμμμ|Ααααα|Ουφ/u;
const NAMED_NOISE = /\b(sigh|gasp|cough|chuckle)\b|γελάει|αναστεναγμός|αναστενάζει|βήχας/iu;

export function buildScript(text: string, opening: string, lang: 'el' | 'en'): ScriptResult {
  const speech = plainSpeech(text);
  if (!speech) throw new Error('There is no text to turn into a script.');
  const warnings: string[] = [];
  const blocks: string[] = [];
  let direction = 0;

  const emit = (parts: string[]) => {
    const said = safeQuotes(parts.join(' ')).trim();
    if (!said) return;
    blocks.push(`${opening} ${DIRECTIONS[direction++ % DIRECTIONS.length]}, "${said}"`);
  };

  for (const paragraph of speech.split(/\n\s*\n/)) {
    let current: string[] = [];
    let len = 0;
    for (const s of sentences(paragraph, lang)) {
      if (len > 0 && len + s.length > BLOCK_CHARS) {
        emit(current);
        current = [];
        len = 0;
      }
      current.push(s);
      len += s.length + 1;
    }
    emit(current); // a new paragraph is a new breath
  }

  const spoken = blocks.map(b => b.slice(b.indexOf('"') + 1, -1));
  spoken.forEach((b, i) => {
    if (DEAD_PHONETIC.test(b)) warnings.push(`Block ${i + 1}: a Greek spelling of a noise (like Χαχα) makes no sound in Video-Forge.`);
    if (NAMED_NOISE.test(b)) warnings.push(`Block ${i + 1}: a named noise (sigh, γελάει…) would be read out as a word.`);
  });

  return { script: blocks.join('\n\n') + '\n', blocks: blocks.length, words: spoken.join(' ').split(/\s+/).filter(Boolean).length, warnings };
}

/* ---- the job ------------------------------------------------------------ */

export interface ExportOptions {
  name: string;
  text: string;
  topic?: string;
  /** "none" renders over the flat background: right for a personal story,
   *  which should not be illustrated with stock footage unseen. */
  backgrounds?: 'none' | 'auto';
  /** Which cast member narrates (0 = the first). */
  speaker?: number;
}

export interface ExportResult {
  files: { name: string; data: Buffer }[];
  warnings: string[];
  blocks: number;
  words: number;
}

export function fileSafe(name: string): string {
  return (
    name
      .normalize('NFC')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 60) || 'story'
  );
}

export function buildExport(template: JobTemplate, opts: ExportOptions): ExportResult {
  const lang = languageOfText(opts.text);
  const who = Math.min(Math.max(opts.speaker ?? 0, 0), template.cast.length - 1);
  // The same rule runJob applies: a speaker with no phrase is "Speaker N".
  const opening = String(template.cast[who].openingPhrase || `Speaker ${who + 1}`);
  const built = buildScript(opts.text, opening, lang);

  const base = fileSafe(opts.name);
  const dir = typeof template.scriptPath === 'string' ? template.scriptPath.replace(/[^/\\]*$/, '') : '';
  const job: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(template)) if (!(SCRIPT_BOUND as readonly string[]).includes(k)) job[k] = v;
  const ordered: Record<string, unknown> = {
    scriptPath: `${dir}${base}.txt`,
    language: lang,
    topic: (opts.topic || opts.name).slice(0, 300),
    backgrounds: opts.backgrounds === 'auto' ? 'auto' : 'none',
    ...job,
  };

  const warnings = [...built.warnings];
  if (!dir) warnings.push('The uploaded job has no scriptPath, so the script path in the .json is just the file name. Set it to where you put the .txt.');
  if (template.cast.length > 1 && who === 0) warnings.push(`The whole story is narrated by "${template.cast[0].label}". Choose another speaker if you want a different voice.`);
  return {
    files: [
      { name: `${base}.txt`, data: Buffer.from(built.script, 'utf8') },
      { name: `${base}.json`, data: Buffer.from(JSON.stringify(ordered, null, 2) + '\n', 'utf8') },
    ],
    warnings,
    blocks: built.blocks,
    words: built.words,
  };
}

/* ---- a zip, without a dependency ---------------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A stored (uncompressed) zip: two small text files do not need more, and
 *  every unzip tool, including Windows Explorer, opens it. UTF-8 names. */
export function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(f.data.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, f.data);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt16LE(dosTime, 12);
    c.writeUInt16LE(dosDate, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(f.data.length, 20);
    c.writeUInt32LE(f.data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += local.length + name.length + f.data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
