// The interviewer only builds prompts and cleans replies; whether it speaks is
// the interface's decision. These check the promises in the prompt.
import { describe, it, expect } from 'vitest';
import { buildInterviewPrompt, cleanReply, languageOf } from '../interviewer.ts';
import { renderSession } from '../sessions.ts';

const base = { transcript: '', language: 'el' as const, recent: [] as string[] };

describe('interviewer prompts', () => {
  it('asks for one short question and forbids diagnosis and comfort', () => {
    const p = buildInterviewPrompt({ ...base, mode: 'ask', transcript: 'Θυμάμαι τη γιαγιά μου στο χωριό.' });
    expect(p).toMatch(/exactly ONE question/);
    expect(p).toMatch(/Never diagnose/);
    expect(p).toMatch(/Never console/);
    expect(p).toContain('γιαγιά');
  });

  it('never repeats a question already asked', () => {
    const p = buildInterviewPrompt({ ...base, mode: 'ask', recent: ['Πώς ήταν το σπίτι;'] });
    expect(p).toContain('Πώς ήταν το σπίτι;');
    expect(p).toMatch(/never repeat/i);
  });

  it('follows the topic the writer chose', () => {
    expect(buildInterviewPrompt({ ...base, mode: 'ask', topic: 'το σχολείο' })).toContain('το σχολείο');
  });

  it('suggestions come only from thin parts of the life, and only three', () => {
    const p = buildInterviewPrompt({ ...base, mode: 'suggest', thin: ['Στρατός (1998)'] });
    expect(p).toContain('Στρατός (1998)');
    expect(p).toMatch(/exactly three/);
  });

  it('answers in the language being spoken, not the one selected', () => {
    const p = buildInterviewPrompt({ ...base, language: 'el', mode: 'ask', transcript: 'I remember the house we lived in when I was small, it had a blue door.' });
    expect(p).toMatch(/Reply in English/);
    expect(languageOf('', 'el')).toBe('el');
  });

  it('cleans a reply down to the question, or the three suggestions', () => {
    expect(cleanReply('ask', '"Τι έγινε μετά;"\nΕλπίζω να βοήθησα.')).toEqual(['Τι έγινε μετά;']);
    expect(cleanReply('suggest', '1. Το σπίτι\n2) Η Βούλα\n- Το σχολείο\n- Τέταρτο')).toEqual(['Το σπίτι', 'Η Βούλα', 'Το σχολείο']);
    expect(cleanReply('ask', '   ')).toEqual([]);
  });
});

describe('session log', () => {
  it('is markdown with the words and the questions in order', () => {
    const md = renderSession('abc12345', {
      started: '2026-10-17T10:00:00Z',
      language: 'el',
      text: 'Γεννήθηκα στο Κιλκίς.',
      notes: [
        { at: 95, kind: 'question', text: 'Πώς ήταν το σπίτι;' },
        { at: 130, kind: 'topic', text: 'το σχολείο' },
      ],
    });
    expect(md).toContain('## What I said');
    expect(md).toContain('Γεννήθηκα στο Κιλκίς.');
    expect(md).toContain('**1:35** asked: Πώς ήταν το σπίτι;');
    expect(md).toContain('**2:10** I chose: το σχολείο');
  });
});
