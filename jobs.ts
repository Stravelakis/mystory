/* =============================================================================
   JOBS — transcriptions that must survive a crash.

   A recording is written to the vault before anything else (STANDARDS §1).
   What was NOT durable was the work after it: a server restart in the middle
   of a long transcription left an entry with audio and no words, and nobody
   knew to look. Now a small file marks the job as started, and is removed
   only once the words are saved. At start-up, every job still marked is run
   again, one at a time.

     vault/.jobs/<entry id>.json   { id, mime, options, started, attempts }
   ========================================================================== */

import fs from 'node:fs/promises';
import path from 'node:path';
import { VAULT_DIR, isValidId } from './vault.ts';

const JOBS_DIR = path.join(VAULT_DIR, '.jobs');
/** A job that has failed this many times is left for "Transcribe again". */
export const MAX_ATTEMPTS = 3;

export interface Job {
  id: string;
  mime: string;
  /** What the upload asked for: language, style, engine. Never the audio. */
  options: { language?: string; style?: string; engine?: string };
  started: string;
  attempts: number;
}

export async function markJob(id: string, mime: string, options: Job['options']): Promise<void> {
  if (!isValidId(id)) return;
  await fs.mkdir(JOBS_DIR, { recursive: true });
  const prior = await readJob(id);
  const job: Job = {
    id,
    mime,
    options: { language: options.language, style: options.style, engine: options.engine },
    started: prior?.started || new Date().toISOString(),
    attempts: (prior?.attempts || 0) + 1,
  };
  const file = path.join(JOBS_DIR, `${id}.json`);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(job), 'utf8');
  await fs.rename(`${file}.tmp`, file);
}

export async function readJob(id: string): Promise<Job | null> {
  if (!isValidId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(JOBS_DIR, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

export async function dropJob(id: string): Promise<void> {
  if (!isValidId(id)) return;
  await fs.rm(path.join(JOBS_DIR, `${id}.json`), { force: true });
}

export async function listJobs(): Promise<Job[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(JOBS_DIR);
  } catch {
    return [];
  }
  const out: Job[] = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const job = await readJob(n.slice(0, -5));
    if (job) out.push(job);
  }
  return out.sort((a, b) => a.started.localeCompare(b.started));
}
