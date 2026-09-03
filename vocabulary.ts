/* =============================================================================
   VOCABULARY — the words the app is allowed to put on your writing.

   Three rules shape this file.

   1. It is data, not code. It lives here so it can be replaced. Point
      INDICATORS_FILE at a JSON file of your own and none of these terms apply
      to you any more. Someone else's family did not work like yours, and the
      vocabulary of one therapeutic tradition is not the vocabulary of all of
      them.

   2. Terms are grouped by what they are *about*, because a flat list makes a
      category error. "Gaslighting" is something done to you. "Fawn" is
      something you did to survive it. "Scapegoat" is a position you were put
      in. Filing all three under one heading turns a coping response into a
      symptom and a survival strategy into a fault.

   3. Every term carries a plain definition. The app shows the definition
      beside the tag, and a chapter draft can explain the term in the same
      breath as the episode it names. A label you have to go and look up is
      not evidence of anything.

   Nothing here is a diagnosis. These name behaviours and dynamics — things
   that happened, and what they are commonly called. They do not name what
   anybody *is*.
   ========================================================================== */

import fs from 'fs/promises';

export type Category = 'pattern' | 'role' | 'response' | 'protection';

export interface Term {
  id: string;
  label: string;
  category: Category;
  definition: string;
  /** Extra phrasings the model may return; matched when normalising. */
  aliases?: string[];
}

export const CATEGORIES: Record<Category, { label: string; blurb: string }> = {
  pattern: {
    label: 'Done to me',
    blurb: 'Tactics and dynamics directed at you by someone else.',
  },
  role: {
    label: 'Position in the system',
    blurb: 'The part you or someone else was cast in by the family or group.',
  },
  response: {
    label: 'How I survived it',
    blurb: 'What you did to get through. These are adaptations, not faults.',
  },
  protection: {
    label: 'What protected me',
    blurb: 'Boundaries, exits, witnesses, and the things that worked.',
  },
};

export const DEFAULT_TERMS: Term[] = [
  /* --- Done to me -------------------------------------------------------- */
  {
    id: 'gaslighting',
    label: 'Gaslighting',
    category: 'pattern',
    definition:
      'Being told, repeatedly, that what you saw or remembered did not happen — until you stop trusting your own account of it.',
  },
  {
    id: 'darvo',
    label: 'DARVO',
    category: 'pattern',
    definition:
      'Deny, Attack, Reverse Victim and Offender. You raise something that was done to you and end the conversation apologising for raising it.',
  },
  {
    id: 'hoovering',
    label: 'Hoovering',
    category: 'pattern',
    definition:
      'Being pulled back in after distance — warmth, a crisis, an apology that never quite names the thing — timed to when you were nearly out.',
  },
  {
    id: 'projection',
    label: 'Projection',
    category: 'pattern',
    definition:
      'Being accused of the exact thing the other person is doing, often before you have noticed they are doing it.',
  },
  {
    id: 'minimization',
    label: 'Minimisation',
    category: 'pattern',
    definition:
      'The scale of what happened is shaved down until objecting to it looks disproportionate. "It was nothing." "You are still on that?"',
    aliases: ['minimisation'],
  },
  {
    id: 'isolation',
    label: 'Isolation',
    category: 'pattern',
    definition:
      'The people who would have corroborated your account are made costly to keep, one at a time, usually with a reason each time.',
  },
  {
    id: 'triangulation',
    label: 'Triangulation',
    category: 'pattern',
    definition:
      'A third person is routed through instead of speaking to you directly — to compare you, to carry a message, or to make a private matter into a verdict.',
  },
  {
    id: 'emotional-blackmail',
    label: 'Emotional blackmail',
    category: 'pattern',
    definition:
      'Compliance obtained by putting something you care about at stake: their wellbeing, their approval, the peace of the household.',
  },
  {
    id: 'trauma-bonding',
    label: 'Trauma bonding',
    category: 'pattern',
    definition:
      'Attachment strengthened rather than broken by cycles of harm and relief, because the relief comes from the same person as the harm.',
  },
  {
    id: 'silent-treatment',
    label: 'Silent treatment',
    category: 'pattern',
    definition:
      'Withdrawal used as a punishment — contact cut off with no stated reason and no stated end, until you work out what to concede.',
    aliases: ['stonewalling'],
  },
  {
    id: 'moving-goalposts',
    label: 'Moving goalposts',
    category: 'pattern',
    definition:
      'The standard changes each time you meet it, so the approval it was attached to never arrives.',
  },
  {
    id: 'parentification',
    label: 'Parentification',
    category: 'pattern',
    definition:
      'A child made responsible for an adult’s feelings, logistics, or stability, and treated as unkind for having needs of their own.',
  },
  {
    id: 'infantilization',
    label: 'Infantilisation',
    category: 'pattern',
    definition:
      'Being treated as less capable than you are, so that your judgement can be overruled without it looking like control.',
    aliases: ['infantilisation'],
  },
  {
    id: 'love-bombing',
    label: 'Love bombing',
    category: 'pattern',
    definition:
      'Intensity front-loaded — attention, gifts, declarations — at a speed that creates obligation before it creates knowledge of the person.',
  },
  {
    id: 'smear-campaign',
    label: 'Smear campaign',
    category: 'pattern',
    definition:
      'Your reputation is worked on in advance, among the people you would have gone to, so that your account arrives already discounted.',
  },

  /* --- Position in the system -------------------------------------------- */
  {
    id: 'scapegoat',
    label: 'Scapegoat',
    category: 'role',
    definition:
      'The one the family’s problems are assigned to. Naming the dysfunction is treated as being the dysfunction.',
  },
  {
    id: 'golden-child',
    label: 'Golden child',
    category: 'role',
    definition:
      'The one who can do no wrong, held up as the standard. The role costs its holder too — the approval is conditional on continuing to earn it.',
  },
  {
    id: 'flying-monkeys',
    label: 'Flying monkeys',
    category: 'role',
    definition:
      'Third parties recruited to carry pressure, gather information, or deliver the message — often sincerely, believing they are helping.',
    aliases: ['flying monkey'],
  },
  {
    id: 'lost-child',
    label: 'Lost child',
    category: 'role',
    definition:
      'The one who survives by not being noticed — needs withdrawn, presence minimised, absence read as being fine.',
  },
  {
    id: 'identified-patient',
    label: 'Identified patient',
    category: 'role',
    definition:
      'The member sent for help, whose treatment lets the system avoid examining itself.',
  },
  {
    id: 'enabler',
    label: 'Enabler',
    category: 'role',
    definition:
      'The one who keeps the peace by managing around the harm rather than naming it, usually at the cost of whoever is absorbing it.',
  },

  /* --- How I survived it -------------------------------------------------- */
  {
    id: 'fawn',
    label: 'Fawn',
    category: 'response',
    definition:
      'Danger met by appeasing — agreeing, soothing, pre-empting, becoming useful. A survival response, and the hardest one to spot as one.',
  },
  {
    id: 'gray-rock',
    label: 'Gray rock',
    category: 'response',
    definition:
      'Becoming deliberately uninteresting — flat, brief, factual — so there is nothing to react to and nothing to take.',
    aliases: ['grey rock'],
  },
  {
    id: 'freeze',
    label: 'Freeze',
    category: 'response',
    definition:
      'Going still and blank under threat. Often remembered afterwards as not having done anything, which is not the same thing.',
  },
  {
    id: 'hypervigilance',
    label: 'Hypervigilance',
    category: 'response',
    definition:
      'Continuously reading the room for the first sign of a turn. Exhausting, and usually accurate — it was learned somewhere real.',
  },
  {
    id: 'self-blame',
    label: 'Self-blame',
    category: 'response',
    definition:
      'Taking the cause into yourself, because a world where you caused it is one you can still control.',
  },
  {
    id: 'dissociation',
    label: 'Dissociation',
    category: 'response',
    definition:
      'Leaving, without leaving. Gaps, flatness, watching from outside. A common reason an account has holes in it that are not indifference.',
  },
  {
    id: 'appeasement-forgetting',
    label: 'Motivated forgetting',
    category: 'response',
    definition:
      'Not a memory fault — an avoidance of remembering, learned because remembering had a cost at the time.',
  },

  /* --- What protected me --------------------------------------------------- */
  {
    id: 'boundaries',
    label: 'Boundary held',
    category: 'protection',
    definition:
      'A limit stated and kept, regardless of the response it drew. The keeping is the boundary; the stating is only the announcement.',
  },
  {
    id: 'no-contact',
    label: 'No contact',
    category: 'protection',
    definition:
      'Contact ended deliberately and maintained. Distinct from a falling-out, because it is a decision rather than an outcome.',
  },
  {
    id: 'grey-rock-exit',
    label: 'Exit',
    category: 'protection',
    definition:
      'Leaving the situation — the room, the house, the job, the friendship — as the thing that actually ended the harm.',
  },
  {
    id: 'witness',
    label: 'Witness',
    category: 'protection',
    definition:
      'Someone who saw it and said so. The single most useful thing against being told it did not happen.',
  },
  {
    id: 'documentation',
    label: 'Documentation',
    category: 'protection',
    definition:
      'A record made at the time. This app is one. It outranks memory in an argument, including an argument with yourself.',
  },
  {
    id: 'support',
    label: 'Support',
    category: 'protection',
    definition:
      'A person, group, or professional who took your account at face value and did not require you to justify it first.',
  },
  {
    id: 'reality-checking',
    label: 'Reality checking',
    category: 'protection',
    definition:
      'Testing an account against a record or another person, on purpose, rather than against how you feel about it today.',
  },
];

/* -----------------------------------------------------------------------------
   Loading
   -------------------------------------------------------------------------- */

let cache: Term[] | null = null;

function valid(t: any): t is Term {
  return (
    t &&
    typeof t.id === 'string' &&
    typeof t.label === 'string' &&
    typeof t.definition === 'string' &&
    ['pattern', 'role', 'response', 'protection'].includes(t.category)
  );
}

/** The built-in list, or a replacement at INDICATORS_FILE. A malformed
 *  replacement falls back rather than leaving the app with no vocabulary — it
 *  says so loudly in the log, once. */
export async function loadTerms(): Promise<Term[]> {
  if (cache) return cache;
  const file = process.env.INDICATORS_FILE;
  if (file) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf-8'));
      const terms = (Array.isArray(parsed) ? parsed : parsed?.terms) || [];
      const ok = terms.filter(valid);
      if (ok.length === 0) throw new Error('no usable terms');
      console.info(`[vocabulary] ${ok.length} terms from ${file}`);
      cache = ok;
      return cache;
    } catch (err: any) {
      console.warn(`[vocabulary] ${file} unusable (${err?.message || err}); using the built-in list.`);
    }
  }
  cache = DEFAULT_TERMS;
  return cache;
}

export interface Indicator {
  id: string;
  label: string;
  category: Category;
  definition: string;
  /** The words in the entry that the term was applied to. */
  evidence?: string;
}

/** Turns whatever the model returned into terms that exist, with evidence
 *  kept only when it is genuinely a quote from the entry. A model that invents
 *  a term gets it dropped; a model that invents a quote gets the term without
 *  one. */
export async function normalise(raw: unknown, sourceText: string): Promise<Indicator[]> {
  const terms = await loadTerms();
  const byKey = new Map<string, Term>();
  for (const t of terms) {
    byKey.set(t.id.toLowerCase(), t);
    byKey.set(t.label.toLowerCase(), t);
    for (const a of t.aliases || []) byKey.set(a.toLowerCase(), t);
  }

  const rows: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.indicators)
      ? (raw as any).indicators
      : Array.isArray((raw as any)?.tags)
        ? (raw as any).tags
        : [];

  const haystack = sourceText.toLowerCase().replace(/\s+/g, ' ');
  const out: Indicator[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const key = String(typeof row === 'string' ? row : row?.term ?? row?.id ?? row?.label ?? '')
      .toLowerCase()
      .trim();
    const term = byKey.get(key);
    if (!term || seen.has(term.id)) continue;
    seen.add(term.id);

    let evidence: string | undefined;
    const quote = typeof row === 'object' ? String(row?.evidence ?? row?.quote ?? '').trim() : '';
    if (quote) {
      // A quote that is not in the entry is a quote the model made up, and the
      // term goes with it. A label resting on invented evidence is worse than
      // no label at all: this record is meant to be one you can still trust
      // years later, when you no longer remember writing it.
      if (!haystack.includes(quote.toLowerCase().replace(/\s+/g, ' '))) {
        seen.delete(term.id);
        continue;
      }
      evidence = quote.slice(0, 400);
    }

    out.push({
      id: term.id,
      label: term.label,
      category: term.category,
      definition: term.definition,
      ...(evidence ? { evidence } : {}),
    });
  }
  return out;
}

/** The instruction given to the tagging model. Built from the loaded
 *  vocabulary so a replaced list changes the prompt with it. */
export async function buildPrompt(transcript: string): Promise<string> {
  const terms = await loadTerms();
  const byCat = (c: Category) =>
    terms
      .filter(t => t.category === c)
      .map(t => `  - ${t.id}: ${t.definition}`)
      .join('\n');

  return `You are reading one entry from a personal journal in which someone is recording their own life, in their own words, so that they have a record of it.

Identify which of the terms below are actually depicted in this entry. Work only from what the text describes. Do not infer, do not diagnose anyone, and do not label a person — label what happened.

DONE TO THEM (tactics directed at the writer by someone else):
${byCat('pattern')}

POSITION IN THE SYSTEM (a part someone was cast in):
${byCat('role')}

HOW THEY SURVIVED IT (the writer's own adaptations — never a criticism):
${byCat('response')}

WHAT PROTECTED THEM (things that worked):
${byCat('protection')}

Rules:
- Only include a term if the entry shows it. An entry with nothing in it returns an empty list. Returning nothing is a correct answer and is often the right one.
- "evidence" must be an EXACT substring copied from the entry, at most one or two sentences, showing why the term applies. Never paraphrase it. If you cannot quote it, do not include the term.
- Prefer few, well-evidenced terms over many weak ones.

Return ONLY JSON, with no code fence and no commentary, in this shape:
{"indicators":[{"term":"<id>","evidence":"<exact quote from the entry>"}]}

Entry:
"""
${transcript}
"""`;
}
