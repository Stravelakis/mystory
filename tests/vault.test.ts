// The vault is the one thing that must never lose a word. These run against a
// throwaway folder; VAULT_DIR is read when vault.ts loads, so it is set first.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mystory-vault-'));
process.env.VAULT_DIR = dir;
const vault = await import('../vault.ts');

describe('ids', () => {
  it('makes ids that validate, and rejects anything path-like', () => {
    const id = vault.newId(new Date('2026-08-16T14:25:30Z'));
    expect(vault.isValidId(id)).toBe(true);
    expect(vault.isValidId('../../etc/passwd')).toBe(false);
    expect(vault.isValidId('20260816-142530-a3f/..')).toBe(false);
    expect(vault.isValidId(42)).toBe(false);
  });
});

describe('timelineKey', () => {
  const created = '2026-09-25T10:00:00Z';
  it('orders by when it happened, not when it was written', () => {
    const early = vault.timelineKey({ created, occurred: { start: '2011' } });
    const late = vault.timelineKey({ created, occurred: { start: '2019' } });
    expect(early).toBeLessThan(late);
  });
  it('places a range at its middle', () => {
    const range = vault.timelineKey({ created, occurred: { start: '2011', end: '2012' } });
    const y2011 = vault.timelineKey({ created, occurred: { start: '2011-06' } });
    const y2013 = vault.timelineKey({ created, occurred: { start: '2013' } });
    expect(range).toBeGreaterThan(y2011);
    expect(range).toBeLessThan(y2013);
  });
  it('falls back to when it was written if it is not placed in time', () => {
    expect(vault.timelineKey({ created })).toBe(Date.parse(created));
  });
});

describe('entries on disk', () => {
  let id: string;
  const greek = 'Λίγους μήνες αργότερα, είπε σε όλη την οικογένεια ότι τα είχα φανταστεί όλα.\n\n---\nNot front matter.';

  beforeAll(async () => {
    const e = await vault.saveEntry({
      title: 'What she told: "the family"',
      text: greek,
      found: [{ id: 'gaslighting', evidence: 'τα είχα φανταστεί όλα' }],
      occurred: { text: 'Λίγους μήνες αργότερα', start: '2011', end: '2012', confidence: 'anchored' },
    });
    id = e.id;
  });

  it('reads back exactly what was written, Greek and awkward characters included', async () => {
    const e = await vault.readEntry(id);
    expect(e.text).toBe(greek);
    expect(e.title).toBe('What she told: "the family"');
    expect(e.found).toEqual([{ id: 'gaslighting', evidence: 'τα είχα φανταστεί όλα' }]);
    expect(e.occurred).toMatchObject({ start: '2011', end: '2012', confidence: 'anchored' });
  });

  it('keeps every field a later save does not mention', async () => {
    await vault.saveEntry({ id, drive: 'https://example.invalid/doc' });
    const e = await vault.readEntry(id);
    expect(e.text).toBe(greek);
    expect(e.found).toHaveLength(1);
    expect(e.drive).toBe('https://example.invalid/doc');
  });

  it('never leaves a temp file behind', async () => {
    const names = await fs.readdir(dir);
    expect(names.filter(n => n.endsWith('.tmp'))).toEqual([]);
  });

  it('trash moves the file, never deletes it', async () => {
    await vault.trashEntry(id);
    await expect(vault.readEntry(id)).rejects.toThrow();
    const trashed = await fs.readdir(path.join(dir, '.trash'));
    expect(trashed.some(n => n.startsWith(id))).toBe(true);
  });
});
