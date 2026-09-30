/* =============================================================================
   YOUR VOICE — a reading session that teaches the app how you sound.

   The writer reads short sentences aloud, one at a time. Each clip is kept
   with the exact text it was reading, which gives two things no amount of
   guessing can:

   1. A measurement. Every transcription engine can be run on the clips and
      scored against the known text, so the best engine for THIS voice is
      chosen by its error rate, not by reputation.
   2. Training data. The same clips are what a speech model is fine-tuned on
      (training/), the modern version of the old "read these passages" setup.

   Stored in the vault, beside everything else:
     vault/voice/script.json   the sentences, in reading order
     vault/voice/clips/<n>.<ext>
     vault/voice/clips.json    [{ n, text, file, mime, bytes, at }]

   The script is deliberately calm, everyday language. Reading forty minutes
   about the hardest parts of one's life, to train a machine, is not a cost
   anyone should pay; the vocabulary that matters (names, places, family
   words) is woven into ordinary sentences instead.
   ========================================================================== */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { VAULT_DIR, ensureVault } from './vault.ts';

const VOICE_DIR = path.join(VAULT_DIR, 'voice');
const CLIP_DIR = path.join(VOICE_DIR, 'clips');
const SCRIPT_FILE = path.join(VOICE_DIR, 'script.json');
const CLIPS_FILE = path.join(VOICE_DIR, 'clips.json');

export interface ScriptLine {
  n: number;
  text: string;
  language: 'el' | 'en';
}

export interface Clip {
  n: number;
  text: string;
  file: string; // relative to vault/voice
  mime: string;
  bytes: number;
  at: string;
  /** Loudest moment, in dB (0 = full scale). Set once checked. */
  peakDb?: number;
}

/** Below this the clip holds no voice. A quiet speaker on a good mic peaks
 *  around -30 dB; a microphone that is not connected sits near -80. On
 *  30 Sep 2026, 100 clips were read into a dead microphone at -72 dB peak,
 *  and every engine was then scored on silence. */
export const SILENT_DB = -45;

/** The loudest moment of a recording, via ffmpeg's volumedetect. */
export function peakDb(audio: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    let err = '';
    let proc;
    try {
      proc = spawn('ffmpeg', ['-hide_banner', '-i', 'pipe:0', '-af', 'volumedetect', '-f', 'null', '-']);
    } catch (e) {
      return reject(e);
    }
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', () => {
      const m = err.match(/max_volume:\s*(-?[\d.]+|-inf) dB/);
      if (!m) return reject(new Error('Could not measure the recording.'));
      resolve(m[1] === '-inf' ? -120 : Number(m[1]));
    });
    proc.stdin.on('error', () => {});
    proc.stdin.end(audio);
  });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
  await fs.rename(tmp, file);
}

export const loadScript = () => readJson<ScriptLine[]>(SCRIPT_FILE, []);
export const loadClips = () => readJson<Clip[]>(CLIPS_FILE, []);

/** Keeps sentences that are readable aloud in one breath, drops duplicates. */
export function cleanScript(raw: unknown, language: 'el' | 'en'): ScriptLine[] {
  const rows: unknown[] = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.sentences) ? (raw as any).sentences : [];
  const seen = new Set<string>();
  const out: ScriptLine[] = [];
  for (const r of rows) {
    const text = String((r as any)?.text ?? r ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    const words = text.split(' ').length;
    const key = text.toLocaleLowerCase('el');
    if (words < 4 || words > 30 || seen.has(key)) continue;
    seen.add(key);
    out.push({ n: out.length + 1, text, language });
  }
  return out;
}

/** Adds sentences to the end of the script, numbered after the last one. A
 *  script is only ever added to, so clip numbers keep meaning the same line. */
export async function appendScript(lines: ScriptLine[]): Promise<ScriptLine[]> {
  await ensureVault();
  const current = await loadScript();
  const have = new Set(current.map(l => l.text.toLocaleLowerCase('el')));
  let n = current.reduce((m, l) => Math.max(m, l.n), 0);
  for (const l of lines) {
    if (have.has(l.text.toLocaleLowerCase('el'))) continue;
    have.add(l.text.toLocaleLowerCase('el'));
    current.push({ ...l, n: ++n });
  }
  await writeJson(SCRIPT_FILE, current);
  return current;
}

const EXT: Record<string, string> = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', wav: 'wav' };

/** Saves (or replaces — "Redo") the clip for script line n. */
export async function saveClip(n: number, audio: Buffer, mime: string, peak?: number): Promise<Clip> {
  const script = await loadScript();
  const line = script.find(l => l.n === n);
  if (!line) throw new Error('That line is not in the script.');
  await fs.mkdir(CLIP_DIR, { recursive: true, mode: 0o700 });
  const ext = Object.entries(EXT).find(([k]) => mime.includes(k))?.[1] || 'webm';
  const file = path.posix.join('clips', `${String(n).padStart(4, '0')}.${ext}`);
  // A redo in a different container leaves no stale twin behind.
  for (const e of new Set(Object.values(EXT))) {
    if (e !== ext) await fs.rm(path.join(VOICE_DIR, 'clips', `${String(n).padStart(4, '0')}.${e}`), { force: true });
  }
  await fs.writeFile(path.join(VOICE_DIR, file), audio, { mode: 0o600 });
  const clip: Clip = { n, text: line.text, file, mime, bytes: audio.length, at: new Date().toISOString(), ...(peak !== undefined ? { peakDb: peak } : {}) };
  const clips = (await loadClips()).filter(c => c.n !== n);
  clips.push(clip);
  clips.sort((a, b) => a.n - b.n);
  await writeJson(CLIPS_FILE, clips);
  return clip;
}

/** Measures every clip not yet measured, and moves silent ones to
 *  vault/.trash/voice/ so their sentences count as unread again. Returns how
 *  many were set aside. */
export async function setAsideSilentClips(): Promise<{ checked: number; silent: number[] }> {
  const clips = await loadClips();
  const keep: Clip[] = [];
  const silent: number[] = [];
  let checked = 0;
  for (const c of clips) {
    if (c.peakDb === undefined) {
      try {
        c.peakDb = await peakDb(await readClip(c));
        checked++;
      } catch {
        keep.push(c);
        continue;
      }
    }
    if (c.peakDb < SILENT_DB) {
      const trash = path.join(VAULT_DIR, '.trash', 'voice');
      await fs.mkdir(trash, { recursive: true, mode: 0o700 });
      await fs
        .rename(path.join(VOICE_DIR, c.file), path.join(trash, `${Date.now()}-${path.basename(c.file)}`))
        .catch(() => {});
      silent.push(c.n);
    } else keep.push(c);
  }
  if (checked || silent.length) await writeJson(CLIPS_FILE, keep);
  return { checked, silent };
}

export async function readClip(c: Clip): Promise<Buffer> {
  return fs.readFile(path.join(VOICE_DIR, c.file));
}

/* ---- scoring ------------------------------------------------------------- */

/** Lowercase, no punctuation, no Greek accents or diaeresis, single spaces.
 *  Scoring is about hearing the right words, not about where the comma went
 *  or whether a tonos landed (the tidying pass handles those). */
export function normaliseForScore(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('el')
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance<T>(a: T[], b: T[]): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Word error rate: the share of words that were wrong, missing or extra. */
export function wordErrorRate(reference: string, heard: string): number {
  const r = normaliseForScore(reference).split(' ').filter(Boolean);
  const h = normaliseForScore(heard).split(' ').filter(Boolean);
  if (r.length === 0) return h.length ? 1 : 0;
  return editDistance(r, h) / r.length;
}

/** Every k-th clip, so a measurement covers the whole session evenly. */
export function sampleClips(clips: Clip[], max: number): Clip[] {
  if (clips.length <= max) return clips;
  const step = clips.length / max;
  return Array.from({ length: max }, (_, i) => clips[Math.floor(i * step)]);
}
