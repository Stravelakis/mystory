import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mystory-chapters-'));
process.env.VAULT_DIR = dir;
const ch = await import('../chapters.ts');

describe('planParts', () => {
  it('keeps everything in one part when it fits', () => {
    expect(ch.planParts(['a', 'b'], ['x'.repeat(30), 'y'.repeat(30)], 100)).toEqual([['a', 'b']]);
  });
  it('splits in order when it does not', () => {
    expect(ch.planParts(['a', 'b', 'c'], ['x'.repeat(300), 'y'.repeat(300), 'z'.repeat(30)], 120)).toEqual([
      ['a'],
      ['b', 'c'],
    ]);
  });
  it('gives an entry bigger than the budget a part of its own, never drops it', () => {
    expect(ch.planParts(['big', 'small'], ['x'.repeat(10_000), 'y'], 10)).toEqual([['big'], ['small']]);
  });
});

describe('chapterId', () => {
  it('is the same for the same entries in any order', () => {
    expect(ch.chapterId(['b', 'a'])).toBe(ch.chapterId(['a', 'b']));
    expect(ch.isChapterId(ch.chapterId(['a']))).toBe(true);
    expect(ch.isChapterId('../x')).toBe(false);
  });
});

describe('parts on disk', () => {
  const entries = ['20260101-000000-aaaa', '20260102-000000-bbbb'];
  const plan = [[entries[0]], [entries[1]]];

  it('saves each part as it lands and reads it back', async () => {
    const c = await ch.openChapter(entries, plan);
    await ch.savePart(c.id, 0, 'Part one, with a <!-- comment --> and "quotes".', 'The summer we moved');
    const back = await ch.readChapter(c.id);
    expect(back?.title).toBe('The summer we moved');
    expect(back?.parts).toEqual(['Part one, with a <!-- comment --> and "quotes".', '']);
  });

  it('resumes: reopening the same plan keeps the parts already drafted', async () => {
    const c = await ch.openChapter(entries, plan);
    expect(c.parts[0]).toContain('Part one');
    await ch.savePart(c.id, 1, 'Part two.');
    const list = await ch.listChapters();
    expect(list.find(x => x.id === c.id)?.done).toBe(2);
  });

  it('a different plan starts over, and the old chapter goes to .trash', async () => {
    const c = await ch.openChapter(entries, [entries]);
    expect(c.parts).toEqual(['']);
    const trashed = await fs.readdir(path.join(dir, '.trash'));
    expect(trashed.some(n => n.startsWith(`chapter-${c.id}`))).toBe(true);
  });
});
