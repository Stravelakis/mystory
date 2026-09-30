import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mystory-voice-'));
process.env.VAULT_DIR = dir;
const v = await import('../voice.ts');

describe('scoring what an engine heard', () => {
  it('ignores accents, final sigma, case and punctuation', () => {
    expect(v.wordErrorRate('Η μητέρα μου έλεγε ότι όλα ήταν τέλεια.', 'η μητερα μου ελεγε, οτι ολα ηταν τελεια')).toBe(0);
    expect(v.normaliseForScore('Τέλος!')).toBe('τελοσ');
  });

  it('counts wrong, missing and extra words', () => {
    expect(v.wordErrorRate('ένα δύο τρία τέσσερα', 'ένα δύο τρία τέσσερα')).toBe(0);
    expect(v.wordErrorRate('ένα δύο τρία τέσσερα', 'ένα δυο τρία')).toBe(0.25); // one missing
    expect(v.wordErrorRate('ένα δύο τρία τέσσερα', 'ένα πέντε τρία τέσσερα')).toBe(0.25); // one wrong
    expect(v.wordErrorRate('ένα δύο', 'ένα δύο τρία τέσσερα')).toBe(1); // two extra
  });

  it('samples evenly across the session', () => {
    const clips = Array.from({ length: 100 }, (_, i) => ({ n: i + 1 }) as any);
    const s = v.sampleClips(clips, 5).map(c => c.n);
    expect(s).toEqual([1, 21, 41, 61, 81]);
  });
});

describe('the script and the clips', () => {
  it('keeps sentences readable in one breath, and drops repeats', () => {
    const out = v.cleanScript({ sentences: ['Πολύ μικρό.', 'Σήμερα ο καιρός είναι ήπιος και βγήκαμε βόλτα στο πάρκο.', 'Σήμερα ο καιρός είναι ήπιος και βγήκαμε βόλτα στο πάρκο.'] }, 'el');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ n: 1, language: 'el' });
  });

  it('only ever adds to the script, so a clip number keeps meaning the same line', async () => {
    await v.appendScript([{ n: 0, text: 'Το πρωί πήγα στον φούρνο της γειτονιάς μας.', language: 'el' }]);
    const s = await v.appendScript([
      { n: 0, text: 'Το πρωί πήγα στον φούρνο της γειτονιάς μας.', language: 'el' },
      { n: 0, text: 'Το απόγευμα ήπια καφέ με έναν παλιό φίλο.', language: 'el' },
    ]);
    expect(s.map(l => l.n)).toEqual([1, 2]);
  });

  it('a redo replaces the clip rather than adding a second', async () => {
    await v.saveClip(1, Buffer.from('first'), 'audio/webm');
    await v.saveClip(1, Buffer.from('again'), 'audio/mp4');
    const clips = await v.loadClips();
    expect(clips).toHaveLength(1);
    expect(clips[0].file).toBe('clips/0001.m4a');
    expect((await v.readClip(clips[0])).toString()).toBe('again');
    const files = await fs.readdir(path.join(dir, 'voice', 'clips'));
    expect(files).toEqual(['0001.m4a']);
  });

  it('refuses a clip for a line that is not in the script', async () => {
    await expect(v.saveClip(99, Buffer.from('x'), 'audio/webm')).rejects.toThrow();
  });
});

describe('recording sets', () => {
  it('keeps each set\'s clips apart, and old clips are Set 1', async () => {
    const s2 = await v.createSet({ name: 'Uber Mic cardioid', limit: 15 });
    expect(s2.limit).toBe(15);
    await v.saveClip(2, Buffer.from('second mic'), 'audio/webm', -20, s2.id, 31.6);
    const set1 = await v.loadClips('s1');
    const set2 = await v.loadClips(s2.id);
    expect(set1.map(c => c.n)).toEqual([1]);
    expect(set2).toHaveLength(1);
    expect(set2[0]).toMatchObject({ n: 2, set: s2.id, gapDb: 32 });
    expect(set2[0].file).toBe(`clips/${s2.id}/0002.webm`);
    const sets = await v.loadSets();
    expect(sets.map(s => s.name)).toEqual(['Set 1', 'Uber Mic cardioid']);
  });

  it('remembers what the microphone actually did, and only known fields', async () => {
    const s3 = await v.createSet({ name: 'headset' });
    await v.updateSet(s3.id, { mic: 'USB Headset', applied: { autoGainControl: true, sampleRate: 48000, evil: '<x>' } as any });
    const saved = (await v.loadSets()).find(s => s.id === s3.id)!;
    expect(saved.mic).toBe('USB Headset');
    expect(saved.applied).toEqual({ autoGainControl: true, sampleRate: 48000 });
  });

  it('refuses a set id that could escape the folder', async () => {
    await expect(v.saveClip(1, Buffer.from('x'), 'audio/webm', -20, '../x')).rejects.toThrow();
  });
});
