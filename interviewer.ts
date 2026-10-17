/* =============================================================================
   INTERVIEWER — questions on screen, only when asked for or switched on.

   The writer is a slow speaker. An interviewer that talks over the pauses is
   worse than none, so this module only ever BUILDS a prompt; the decision to
   speak belongs to the interface, which asks for a question when the writer
   presses a button, or, in the "after a pause" mode they chose, when they have
   been quiet for as long as they set. It never runs by itself on the server.

   Questions are text. They follow what the writer said and the topic they
   named; they do not steer, diagnose or console.
   ========================================================================== */

import { chat } from './providers.ts';

export type InterviewMode = 'ask' | 'suggest';

export interface InterviewRequest {
  mode: InterviewMode;
  /** The end of what has been said so far. */
  transcript: string;
  /** What the writer said they want to talk about. */
  topic?: string;
  language: 'el' | 'en';
  /** Questions already asked this session, so none comes twice. */
  recent: string[];
  /** Parts of the life story that are thin (from the life map). */
  thin?: string[];
}

const TRANSCRIPT_TAIL = 3500;

/** Greek if the words so far are mostly Greek; else the selected language. */
export function languageOf(text: string, fallback: 'el' | 'en'): 'el' | 'en' {
  const greek = (text.match(/[Ͱ-Ͽἀ-῿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (greek + latin < 30) return fallback;
  return greek >= latin ? 'el' : 'en';
}

export function buildInterviewPrompt(req: InterviewRequest): string {
  const lang = languageOf(req.transcript, req.language);
  const langName = lang === 'el' ? 'Greek' : 'English';
  const said = req.transcript.trim().slice(-TRANSCRIPT_TAIL);
  const asked = req.recent.length ? `Questions already asked (never repeat or rephrase them):\n${req.recent.map(q => `- ${q}`).join('\n')}\n\n` : '';

  const base = `You are a quiet, patient interviewer helping someone tell the story of their own life. They speak slowly and carefully, and are talking about hard things. Reply in ${langName}, in plain everyday words.

Never diagnose anyone. Never name what a person "is". Never assume a feeling they did not state. Never console, praise or comment on them. Never invent anything about their life; use only what is written below.
`;

  if (req.mode === 'suggest') {
    return `${base}
They asked for ideas of what to talk about. Offer exactly three, each one short line, each as an open invitation to tell about a time, a person or a place, not a question about feelings. Put each on its own line starting with "- ". Nothing else.

${req.topic ? `They have been talking about: ${req.topic}\n` : ''}${req.thin?.length ? `Parts of their life they have said little about so far:\n${req.thin.map(t => `- ${t}`).join('\n')}\n` : ''}${said ? `What they said most recently:\n"""\n${said}\n"""\n` : 'They have not said anything yet this session.\n'}
${asked}`;
  }

  return `${base}
Ask exactly ONE question. One sentence, at most twenty words. It should help them say more about something they ALREADY mentioned (a person, a place, a moment, what happened next), or if they have said nothing yet, about the topic they chose. It must be easy to answer in their own words. Output only the question.

${req.topic ? `They chose to talk about: ${req.topic}\n\n` : ''}${said ? `What they said most recently:\n"""\n${said}\n"""\n\n` : ''}${asked}`;
}

/** Keeps the first question or the first three suggestions, and drops anything
 *  a model adds around them. */
export function cleanReply(mode: InterviewMode, raw: string): string[] {
  const lines = raw
    .replace(/```[a-z]*/g, '')
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["“«]|["”»]$/g, '').trim())
    .filter(Boolean);
  if (mode === 'suggest') return lines.slice(0, 3);
  const q = lines[0] || '';
  return q ? [q] : [];
}

export async function interview(config: Record<string, string>, req: InterviewRequest): Promise<string[]> {
  const result = await chat(config, {
    task: 'companion',
    prompt: buildInterviewPrompt(req),
    temperature: 0.6,
    validate: (t: string) => cleanReply(req.mode, t).length > 0,
  });
  return cleanReply(req.mode, result.text);
}
