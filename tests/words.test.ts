import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mystory-words-'));
process.env.VAULT_DIR = dir;
const w = await import('../words.ts');

describe('the words file', () => {
  it('round-trips terms and notes, Greek included', async () => {
    await w.saveWords([{ term: 'Σταυρούλα', note: 'my sister — "Βούλα" at home' }, { term: 'Κιλκίς' }]);
    expect(await w.loadWords()).toEqual([
      { term: 'Σταυρούλα', note: 'my sister — "Βούλα" at home' },
      { term: 'Κιλκίς' },
    ]);
    const md = await fs.readFile(path.join(dir, 'words.md'), 'utf8');
    expect(md).toContain('- Σταυρούλα — my sister');
  });

  it('drops blanks and duplicates, ignoring case', () => {
    expect(w.cleanWords(['Βούλα', 'βούλα', '  ', { term: 'Κιλκίς', note: 'town' }])).toEqual([
      { term: 'Βούλα' },
      { term: 'Κιλκίς', note: 'town' },
    ]);
  });

  it('cannot be tricked into extra lines', () => {
    expect(w.cleanWords(['one\n- injected'])).toEqual([{ term: 'one - injected' }]);
  });
});

describe('wordsHint', () => {
  it('fits the list into the space it is given', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ term: `λέξη${i}` }));
    const hint = w.wordsHint(many, 100);
    expect(hint.length).toBeLessThanOrEqual(100);
    expect(hint.startsWith('λέξη0, λέξη1')).toBe(true);
  });
});

describe('keepIfPresent', () => {
  const corpus = 'Η θεία Ρούλα ήρθε από το Κιλκίς.';
  it('keeps only terms that really occur in the entries, and not ones already listed', () => {
    const out = w.keepIfPresent(
      { words: [{ term: 'θεία Ρούλα', why: 'aunt' }, { term: 'Κιλκίς' }, { term: 'Παρίσι' }] },
      corpus,
      [{ term: 'κιλκίς' }],
    );
    expect(out).toEqual([{ term: 'θεία Ρούλα', note: 'aunt' }]);
  });
});
