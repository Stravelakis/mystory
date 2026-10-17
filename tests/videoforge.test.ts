// The Video-Forge export, checked against Video-Forge's own rules (restated
// here from electron/tts/checkScript.ts, since that repo is never imported).
// The same output was also run through the real checkScript and
// parseDramaboxScript from DnD-World/Video-Forge when this was written.
import { describe, it, expect } from 'vitest';
import { buildScript, buildExport, sentences, plainSpeech, makeZip, crc32, fileSafe, languageOfText } from '../videoforge.ts';
import { stripCitations } from '../lifebook.ts';

const OPENING = 'A bright woman';
const JOB_WORDS = /\b(teacher|trainer|host|narrator|presenter|announcer|instructor|coach|vet|doctor|nurse|detective|reporter|expert)\b/i;

/** Video-Forge's rules for a block: it opens with the speaker's phrase, has
 *  speech in an even number of quotes, nothing after the last quote, and no
 *  job word outside the quotes. The script ends on speech. */
function problemsIn(script: string): string[] {
  const out: string[] = [];
  const blocks = script.trim().split(/\n\s*\n/);
  for (const b of blocks) {
    const flat = b.replace(/\s+/g, ' ').trim();
    if (!flat.toLowerCase().startsWith(OPENING.toLowerCase())) out.push(`does not open with the phrase: ${flat.slice(0, 40)}`);
    const q = (flat.match(/"/g) || []).length;
    if (q === 0 || q % 2) out.push(`quotes: ${q}`);
    if (flat.slice(flat.lastIndexOf('"') + 1).trim()) out.push('text after the last quote');
    if (JOB_WORDS.test(flat.replace(/"[^"]*"/g, ' '))) out.push('job word in the direction');
  }
  if (!blocks[blocks.length - 1].trim().endsWith('"')) out.push('does not end on speech');
  return out;
}

const GREEK = `# Παιδικά χρόνια

Γεννήθηκα στο Κιλκίς το 1985. Το σπίτι μας ήταν μικρό, με μια αυλή και μια μουριά [20260816-142530-a3f9]. Η γιαγιά μου έλεγε: "Μην τρέχεις!" και εγώ έτρεχα πάντα.

Θυμάμαι τη μητέρα μου να μαγειρεύει τις Κυριακές; Δεν ξέρω γιατί. Ίσως επειδή ήταν η μόνη μέρα που ήμασταν όλοι μαζί. Ο πατέρας μου δούλευε πολύ και δεν τον έβλεπα συχνά [20260816-142530-a3f9, 20260817-101010-bbbb].`;

describe('the script', () => {
  it('passes the rules Video-Forge checks', () => {
    const r = buildScript(GREEK, OPENING, 'el');
    expect(problemsIn(r.script)).toEqual([]);
    expect(r.blocks).toBe(2);
  });

  it('keeps the speech inside quotes and the quotes inside the speech out', () => {
    const r = buildScript(GREEK, OPENING, 'el');
    expect(r.script).toContain('«Μην τρέχεις!»');
    expect(r.script).not.toMatch(/\[\d{8}/);
    expect(r.script).not.toContain('# ');
  });

  it('starts a new block at each paragraph, and when a block is full', () => {
    const long = Array.from({ length: 14 }, (_, i) => `Αυτή είναι η πρόταση νούμερο ${i + 1} της ιστορίας μου.`).join(' ');
    const r = buildScript(long, OPENING, 'el');
    expect(r.blocks).toBeGreaterThan(2);
    for (const b of r.script.trim().split(/\n\s*\n/)) expect(b.length).toBeLessThan(560);
    expect(problemsIn(r.script)).toEqual([]);
  });

  it('cuts a sentence that is too long for one go, and never mid-quote', () => {
    const run = 'και ύστερα '.repeat(120).trim() + '.';
    const r = buildScript(run, OPENING, 'el');
    expect(r.blocks).toBeGreaterThan(1);
    expect(problemsIn(r.script)).toEqual([]);
  });

  it('works in English', () => {
    const r = buildScript('I was born in a small town. "Hurry up," she said, "we are late." And we ran.', OPENING, 'en');
    expect(problemsIn(r.script)).toEqual([]);
    expect(r.script).toContain('«Hurry up,»');
  });

  it('warns about sounds Video-Forge cannot make, without changing the words', () => {
    const r = buildScript('Εκείνος έκανε Ουφ και γέλασε.', OPENING, 'el');
    expect(r.warnings.join(' ')).toMatch(/no sound/);
    expect(r.script).toContain('Ουφ');
  });

  it('refuses nothing-to-say', () => {
    expect(() => buildScript('# only a heading\n[20260816-142530-a3f9]', OPENING, 'el')).toThrow(/no text/i);
  });

  it('splits Greek questions at the Greek question mark, English ones not at a semicolon', () => {
    expect(sentences('Πού ήσουν; Στο σπίτι.', 'el')).toEqual(['Πού ήσουν;', 'Στο σπίτι.']);
    expect(sentences('I stayed; she left. Then I cried.', 'en')).toEqual(['I stayed; she left.', 'Then I cried.']);
  });
});

describe('the job', () => {
  const template: any = {
    scriptPath: 'C:/Users/me/vf/scripts/101.1.txt',
    language: 'el',
    format: '9:16',
    preset: 'Halo · duo',
    topic: 'dogs',
    backgrounds: 'auto',
    dramaboxWavDir: 'C:/old/out',
    dramaboxWordsPath: 'C:/old/words.json',
    dumpNarrationMeta: 'C:/tmp',
    cast: [{ label: 'Καίτη', engine: 'piper', openingPhrase: OPENING }, { label: 'Σερίφης', engine: 'piper', openingPhrase: 'A grave man' }],
  };

  it('copies the look, points at the new script, and drops what belonged to the old one', () => {
    const r = buildExport(template, { name: 'Παιδικά χρόνια', text: GREEK });
    const job = JSON.parse(r.files[1].data.toString());
    expect(job.scriptPath).toBe('C:/Users/me/vf/scripts/Παιδικά-χρόνια.txt');
    expect(job.language).toBe('el');
    expect(job.preset).toBe('Halo · duo');
    expect(job.cast).toEqual(template.cast);
    expect(job.dramaboxWavDir).toBeUndefined();
    expect(job.dramaboxWordsPath).toBeUndefined();
    expect(job.dumpNarrationMeta).toBeUndefined();
  });

  it('leaves the background footage off unless asked', () => {
    expect(JSON.parse(buildExport(template, { name: 'x', text: GREEK }).files[1].data.toString()).backgrounds).toBe('none');
    expect(JSON.parse(buildExport(template, { name: 'x', text: GREEK, backgrounds: 'auto' }).files[1].data.toString()).backgrounds).toBe('auto');
  });

  it('uses the chosen speaker\'s phrase, or "Speaker N" when the cast has none', () => {
    expect(buildExport(template, { name: 'x', text: GREEK, speaker: 1 }).files[0].data.toString()).toMatch(/^A grave man /);
    const bare = { ...template, cast: [{ label: 'Me', engine: 'piper' }] };
    expect(buildExport(bare, { name: 'x', text: GREEK }).files[0].data.toString()).toMatch(/^Speaker 1 /);
  });

  it('does not touch the template it was given', () => {
    const before = JSON.stringify(template);
    buildExport(template, { name: 'x', text: GREEK });
    expect(JSON.stringify(template)).toBe(before);
  });
});

describe('text helpers', () => {
  it('strips every kind of citation', () => {
    expect(stripCitations('One [20260816-142530-a3f9]. Two [20260816-142530-a3f9, 20260817-101010-bbbb]. Three.')).toBe('One. Two. Three.');
  });
  it('tells Greek from English', () => {
    expect(languageOfText('Γεννήθηκα στο Κιλκίς')).toBe('el');
    expect(languageOfText('I was born in Kilkis')).toBe('en');
  });
  it('makes file names Windows accepts', () => {
    expect(fileSafe('Μια "ιστορία": α/β?')).toBe('Μια-ιστορία-α-β');
    expect(fileSafe('???')).toBe('story');
  });
  it('plainSpeech drops front matter, headings and emphasis', () => {
    expect(plainSpeech('---\ntitle: x\n---\n# H\n\nSome *bold* text.')).toBe('Some bold text.');
  });
});

describe('the zip', () => {
  it('has the right signatures, sizes and checksums', () => {
    const files = [
      { name: 'a.txt', data: Buffer.from('hello') },
      { name: 'Παιδικά.json', data: Buffer.from('{"a":1}') },
    ];
    const z = makeZip(files);
    expect(z.readUInt32LE(0)).toBe(0x04034b50);
    const end = z.length - 22;
    expect(z.readUInt32LE(end)).toBe(0x06054b50);
    expect(z.readUInt16LE(end + 10)).toBe(2);
    const cdOffset = z.readUInt32LE(end + 16);
    expect(z.readUInt32LE(cdOffset)).toBe(0x02014b50);
    expect(z.readUInt32LE(cdOffset + 16)).toBe(crc32(files[0].data));
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});
