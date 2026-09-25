import { describe, it, expect } from 'vitest';
import { normalise } from '../vocabulary.ts';

const entry = 'When I told my mother, she said it never happened and that I was remembering it wrong. I apologised so it would stop.';

describe('normalise', () => {
  it('keeps a term whose quote is really in the entry', async () => {
    const out = await normalise([{ term: 'gaslighting', evidence: 'she said it never happened' }], entry);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'gaslighting', evidence: 'she said it never happened' });
    expect(out[0].definition.length).toBeGreaterThan(10);
  });

  it('drops a term resting on a quote the model made up', async () => {
    const out = await normalise([{ term: 'gaslighting', evidence: 'she screamed that I was crazy' }], entry);
    expect(out).toEqual([]);
  });

  it('ignores case and spacing differences in the quote', async () => {
    const out = await normalise([{ term: 'gaslighting', evidence: 'SHE SAID   it never\nhappened' }], entry);
    expect(out).toHaveLength(1);
  });

  it('drops terms that are not in the vocabulary, and duplicates', async () => {
    const out = await normalise(['gaslighting', 'Gaslighting', 'made-up-syndrome'], entry);
    expect(out.map(t => t.id)).toEqual(['gaslighting']);
  });

  it('accepts the shapes models actually return', async () => {
    expect(await normalise({ indicators: ['gaslighting'] }, entry)).toHaveLength(1);
    expect(await normalise({ tags: ['gaslighting'] }, entry)).toHaveLength(1);
    expect(await normalise('not json at all', entry)).toEqual([]);
  });
});
