/* =============================================================================
   EPISODES — one thing that happened, drafted into a chapter you can check.

   The point of this file is the citation. A chapter that reads well and cannot
   be traced back is worse than no chapter at all: months later you cannot tell
   which sentence came from something you wrote and which the model rounded
   into shape. So every episode carries the ids of the entries it was built
   from, the draft is told to mark its claims, and a claim marked against an
   entry that was not in the set is stripped before you ever see it.

   An episode is not stored as a new kind of object. It is a chapter drafted
   over a slice of the timeline, and the slice is remembered so it can be
   redrafted later with a better model without losing which entries it covers.
   ========================================================================== */

import { chat } from './providers.ts';
import { loadTerms } from './vocabulary.ts';
import type { EntrySummary, Entry } from './vault.ts';

export interface EpisodeSource {
  id: string;
  title: string;
  when: string;
  indicators: string[];
}

export interface EpisodeDraft {
  title: string;
  text: string;
  sources: EpisodeSource[];
  provider: string;
  model: string;
  /** Citations the model made up, removed before display. Reported rather than
   *  hidden: a model that invents sources is one to stop using for this job. */
  strippedCitations: string[];
}

/** How an entry is shown to the drafting model: its id, when it happened, what
 *  was named in it and why. The evidence quotes go in because a chapter that
 *  explains a term should quote the moment it came from, not paraphrase it. */
async function render(entry: Entry): Promise<string> {
  const terms = await loadTerms();
  const byId = new Map(terms.map(t => [t.id, t]));

  const named = (entry.found || [])
    .map(f => {
      const t = byId.get(f.id);
      if (!t) return null;
      return `  - ${t.label} (${t.category}): ${t.definition}${f.evidence ? `\n    quoted: "${f.evidence}"` : ''}`;
    })
    .filter(Boolean)
    .join('\n');

  const when = entry.occurred?.text
    ? `${entry.occurred.text}${entry.occurred.start ? ` [${entry.occurred.start}${entry.occurred.end && entry.occurred.end !== entry.occurred.start ? `–${entry.occurred.end}` : ''}]` : ''}`
    : entry.occurred?.start || 'not placed in time';

  return [
    `<<ENTRY ${entry.id}>>`,
    `title: ${entry.title}`,
    `when: ${when}`,
    named ? `named in this entry:\n${named}` : 'named in this entry: nothing',
    '',
    entry.english ? `${entry.text}\n\n(in English: ${entry.english})` : entry.text,
    `<<END ${entry.id}>>`,
  ].join('\n');
}

export interface DraftOptions {
  /** What this episode is about, in the writer's words. Optional. */
  focus?: string;
  /** Explain the named patterns as the chapter goes. This is the book mode. */
  explainTerms?: boolean;
  model?: string;
  providerId?: string;
}

export async function draftEpisode(
  config: Record<string, string>,
  entries: Entry[],
  opts: DraftOptions = {},
): Promise<EpisodeDraft> {
  if (entries.length === 0) throw new Error('An episode needs at least one entry.');

  const ordered = [...entries];
  const bodies = await Promise.all(ordered.map(render));
  const ids = ordered.map(e => e.id);

  const prompt = `You are helping someone turn their own journal entries into one chapter of their life story. They have spotty memory and are using this to see what happened, in order, in their own words.

${opts.focus ? `This chapter is about: ${opts.focus}\n` : ''}
Write ONE chapter covering the entries below, in the order they happened.

Rules, all of them load-bearing:

1. CITE EVERYTHING. After each sentence or short passage drawn from an entry, put its id in square brackets, like [20260816-142530-a3f]. Every factual claim needs one. Only use ids that appear below — never invent one.
2. Their words win. Where they wrote a vivid phrase, quote it rather than paraphrasing. Do not upgrade their vocabulary or smooth their tone.
3. Add nothing. No invented detail, no filled-in dialogue, no "she must have felt". If a connection between two entries is your inference, say so plainly in the text.
4. Where an entry is not placed in time, do not invent when it was. Write around it.
5. No diagnosis of anybody. Name behaviours and patterns, never what a person "is".
${
  opts.explainTerms
    ? `6. When a named pattern appears, explain it in one or two plain sentences, at the moment it appears, using the definition given with the entry. Explain it as something that happened, not as a label being applied. Then carry on with the story.`
    : `6. Do not lecture about the named patterns. Tell what happened.`
}

Begin with a title on the first line, as: TITLE: <a few words>
Then the chapter.

Entries, in order:

${bodies.join('\n\n')}`;

  const result = await chat(config, {
    task: 'synthesis',
    prompt,
    temperature: 0.3,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.providerId ? { providerId: opts.providerId } : {}),
  });

  let text = result.text.trim();
  let title = '';
  const titleLine = text.match(/^TITLE:\s*(.+)$/m);
  if (titleLine) {
    title = titleLine[1].trim();
    text = text.replace(titleLine[0], '').trim();
  }

  // A citation pointing at an entry that was not in the set is a made-up
  // source. Strip it rather than letting it look authoritative.
  const allowed = new Set(ids);
  const stripped: string[] = [];
  text = text.replace(/\[([0-9]{8}-[0-9]{6}-[a-z0-9]{4})\]/g, (whole, id) => {
    if (allowed.has(id)) return whole;
    stripped.push(id);
    return '';
  });
  // A bare year in brackets is the model citing the date as if it were a
  // source ("in 2011 [2011]", 25 Sep 2026). It is not one.
  text = text.replace(/ ?\[(1[89]|20)[0-9]{2}(-[0-9]{2}){0,2}\]/g, '');

  return {
    title: title || 'Untitled chapter',
    text: text.replace(/[ \t]+\n/g, '\n').trim(),
    sources: ordered.map(e => ({
      id: e.id,
      title: e.title,
      when: e.occurred?.text || e.occurred?.start || '',
      indicators: e.indicators || [],
    })),
    provider: result.provider,
    model: result.model,
    strippedCitations: [...new Set(stripped)],
  };
}

/** Groups entries into candidate episodes by when they happened.
 *
 *  Deliberately blunt: a gap longer than `gapDays` between one entry and the
 *  next starts a new episode. It is a starting point for the writer to adjust,
 *  not a claim about what belongs together — only they know that. Entries with
 *  no date at all are returned separately rather than dropped, because an
 *  undated entry is not an unimportant one. */
export function proposeEpisodes(
  entries: (EntrySummary & { key: number })[],
  gapDays = 120,
): { placed: (EntrySummary & { key: number })[][]; undated: EntrySummary[] } {
  const undated = entries.filter(e => !e.occurred?.start && !e.occurred?.end);
  const placed = entries
    .filter(e => e.occurred?.start || e.occurred?.end)
    .sort((a, b) => a.key - b.key);

  const groups: (EntrySummary & { key: number })[][] = [];
  const gap = gapDays * 86_400_000;

  for (const e of placed) {
    const last = groups[groups.length - 1];
    if (last && e.key - last[last.length - 1].key <= gap) last.push(e);
    else groups.push([e]);
  }

  return { placed: groups, undated };
}
