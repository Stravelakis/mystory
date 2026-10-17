// Transcriptions marked as started survive a restart and are counted, so a
// recording that keeps failing is not retried forever.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mystory-jobs-'));
process.env.VAULT_DIR = dir;
const { newId } = await import('../vault.ts');
const jobs = await import('../jobs.ts');

describe('jobs', () => {
  it('marks, counts attempts, lists and drops', async () => {
    const id = newId(new Date('2026-10-17T10:00:00Z'));
    await jobs.markJob(id, 'audio/webm', { language: 'el', style: 'corrected', engine: 'auto' });
    await jobs.markJob(id, 'audio/webm', { language: 'el' });
    const [job] = await jobs.listJobs();
    expect(job.id).toBe(id);
    expect(job.attempts).toBe(2);
    expect(job.options.language).toBe('el');
    await jobs.dropJob(id);
    expect(await jobs.listJobs()).toEqual([]);
  });

  it('refuses anything that is not an entry id', async () => {
    await jobs.markJob('../../etc/passwd', 'audio/webm', {});
    expect(await jobs.listJobs()).toEqual([]);
  });

  it('never stores the words or the audio, only the options', async () => {
    const id = newId(new Date('2026-10-17T11:00:00Z'));
    await jobs.markJob(id, 'audio/webm', { language: 'en', liveText: 'private words' } as any);
    const raw = await fs.readFile(path.join(dir, '.jobs', `${id}.json`), 'utf8');
    expect(raw).not.toContain('private words');
    await jobs.dropJob(id);
  });
});
