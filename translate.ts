/* =============================================================================
   TRANSLATE — Greek in, English beside it. Never instead of it.

   Two rules shape this file.

   1. The original is never replaced. A translation is stored alongside the
      text it came from, under its own heading. When someone is keeping a
      record of what was said to them, the words they actually used are the
      evidence; a smoother English sentence is a convenience.

   2. A translator is preferred to a language model. DeepL renders a sentence;
      an LLM rewrites it, and quietly improves the grammar, softens the anger,
      and turns a fragment into a sentence. For a diary that is fine. For
      testimony it is a loss, and it is invisible — you cannot see what was
      smoothed away. So DeepL is tried first and a model is only the fallback,
      which the interface says out loud.
   ========================================================================== */

import { chat } from './providers.ts';

export type Engine = 'deepl' | 'model';

export interface TranslationResult {
  text: string;
  engine: Engine;
  detected?: string;
  /** True when a language model did the work, so the caller can say so. */
  rewritten: boolean;
}

/** DeepL free keys end in ':fx' and use a different host. Getting this wrong
 *  returns 403, which reads like a bad key. */
function deeplHost(key: string): string {
  return key.trim().endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

async function viaDeepL(key: string, text: string, target: string): Promise<TranslationResult> {
  const body = new URLSearchParams();
  body.append('text', text);
  body.append('target_lang', target.toUpperCase() === 'EN' ? 'EN-GB' : target.toUpperCase());
  // preserve_formatting keeps the line breaks someone put in on purpose.
  body.append('preserve_formatting', '1');

  const res = await fetch(`${deeplHost(key)}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key.trim()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    if (res.status === 403) {
      throw new Error(
        'DeepL refused the key. A free key ends in ":fx" and must go to the free endpoint — check it was copied whole.',
      );
    }
    if (res.status === 456) {
      throw new Error('This DeepL key has used up its character allowance for the month.');
    }
    if (res.status === 429) throw new Error('DeepL is rate-limiting this key. Try again in a moment.');
    throw new Error(`DeepL returned ${res.status}. ${detail}`);
  }

  const data: any = await res.json();
  const row = data?.translations?.[0];
  if (!row?.text) throw new Error('DeepL returned nothing.');
  return {
    text: String(row.text),
    engine: 'deepl',
    detected: row.detected_source_language,
    rewritten: false,
  };
}

async function viaModel(config: Record<string, string>, text: string): Promise<TranslationResult> {
  const result = await chat(config, {
    // Borrows the synthesis slot: translating a whole entry is the same shape
    // of job, and it saves inventing a seventh one nobody asked for.
    task: 'synthesis',
    temperature: 0,
    prompt: `Translate the following journal entry into English.

This is somebody's record of their own life, so translate it, do not improve it.
Keep the register, the hesitations and the bluntness. Do not soften anything, do
not tidy fragments into full sentences, and do not add words that are not there.
If a phrase is ambiguous in the original, leave it ambiguous.

Return ONLY the translation. No preamble, no notes, no quotation marks around it.

Entry:
"""
${text}
"""`,
  });

  return { text: result.text.trim(), engine: 'model', rewritten: true };
}

/** DeepL when there is a key, a model when there is not. Throws only when both
 *  are unavailable or both fail. */
export async function translate(
  config: Record<string, string>,
  text: string,
  target = 'EN',
): Promise<TranslationResult> {
  const key = (config.DEEPL_API_KEY || '').trim();

  if (key) {
    try {
      return await viaDeepL(key, text, target);
    } catch (err: any) {
      console.warn(`[translate] DeepL failed, falling back to a model: ${err?.message || err}`);
    }
  }

  return viaModel(config, text);
}
