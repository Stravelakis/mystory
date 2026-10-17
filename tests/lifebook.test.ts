// The life book keeps its promises without a model: names, slugs, what counts
// as thin, and when a chapter is stale.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mystory-book-'));
process.env.VAULT_DIR = dir;
const vault = await import('../vault.ts');
const book = await import('../lifebook.ts');

describe('slugs', () => {
  it('keeps Greek letters, drops accents and punctuation', () => {
    expect(book.slugify('Παιδικά χρόνια (1985–1992)')).toBe('παιδικα-χρονια-1985-1992');
    expect(book.slugify('???')).toBe('period');
  });
  it('refuses anything that could leave the book folder', () => {
    expect(book.isSlug('παιδικα-χρονια')).toBe(true);
    for (const bad of ['../x', 'a/b', '', 'a.b', 'x'.repeat(60), 12]) expect(book.isSlug(bad)).toBe(false);
  });
});

describe('the map and the book', () => {
  it('counts a period as thin until it has enough words, and notices a changed entry', async () => {
    await vault.ensureVault();
    const a = await vault.saveEntry({ id: vault.newId(new Date('2026-10-01T10:00:00Z')), title: 'A', text: 'λέξη '.repeat(100) });
    const b = await vault.saveEntry({ id: vault.newId(new Date('2026-10-02T10:00:00Z')), title: 'B', text: 'λέξη '.repeat(900) });
    const period = { slug: 'p1', name: 'Παιδικά', years: '', summary: '', entries: [a.id, b.id] };
    expect((await book.coverage(period)).thin).toBe(false);
    expect((await book.coverage({ ...period, entries: [a.id] })).thin).toBe(true);

    await fs.mkdir(path.join(dir, 'life'), { recursive: true });
    await fs.writeFile(path.join(dir, 'life', 'map.json'), JSON.stringify({ updated: new Date().toISOString(), periods: [period], people: [], places: [] }));
    await fs.mkdir(path.join(dir, 'book'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'book', 'p1.md'),
      `---\ntitle: "Παιδικά"\nstatus: complete\nparts: 1\ndone: 1\ndrafted: x\nsources: ${JSON.stringify({ [a.id]: a.updated, [b.id]: b.updated })}\n---\n\n# Παιδικά\n\nΚείμενο [${a.id}].\n`,
    );
    let status = await book.bookStatus();
    expect(status.rows[0]).toMatchObject({ drafted: true, stale: false, thin: false });

    await new Promise(r => setTimeout(r, 15));
    await vault.saveEntry({ id: a.id, text: 'λέξη '.repeat(120) });
    status = await book.bookStatus();
    expect(status.rows[0].stale).toBe(true);
  });

  it('reads a chapter back with its title and text, without the heading twice', async () => {
    const c = await book.readChapterFile('p1');
    expect(c?.title).toBe('Παιδικά');
    expect(c?.status).toBe('complete');
    expect(c?.text.startsWith('Κείμενο')).toBe(true);
    expect(await book.readChapterFile('../etc')).toBeNull();
  });
});
