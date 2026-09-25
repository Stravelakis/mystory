/* =============================================================================
   LIVE — Gemini's streaming API, used for ordinary jobs.

   The Live models are built for a conversation, not a request. Every finding
   below was confirmed against a real key on 25 Sep 2026, and each one is the
   reason some line in this file looks stranger than it should:

   · gemini-3.8-live-extended-thinking will not return TEXT at all. It speaks.
     So it is asked for AUDIO with outputAudioTranscription on, and the answer
     is Google's transcript of its own speech. Clean enough to carry JSON.
   · It refuses to start without a thinking level.
   · Every session carries a ~2,600-token preamble of Google's before your
     prompt arrives. A six-word question cost 2,948 tokens. Against a
     65k-tokens-a-minute allowance that is the budget that matters.
   · gemini-3.5-transcribe-live answers nothing. The transcript arrives as
     inputTranscription — its record of what it heard — and the session then
     closes with 1008. That close is success, not failure.
   · gemini-3.5-live-translate-preview translates SPEECH, into speech. Text in
     gets silence. And it is an interpreter, not a job: it never says it has
     finished, so the end is inferred from a pause in its output.
   · All three want 16 kHz mono 16-bit PCM, streamed. Recordings arrive as
     webm or mp4, so ffmpeg sits in between.
   ========================================================================== */

import { spawn } from 'node:child_process';
import { GoogleGenAI, Modality } from '@google/genai';

const SESSION_TIMEOUT_MS = Number(process.env.LIVE_TIMEOUT_MS || 180_000);

/** The error a caller can step past to the next model. Live failures are
 *  often capacity (1011, 429-shaped closes) rather than a bad request. */
export class LiveError extends Error {
  constructor(message: string, readonly code = 0) {
    super(message);
  }
}

function explainClose(code: number, reason: string): string {
  if (code === 1007) return `The Live model refused the request: ${reason}`;
  if (code === 1011) return 'The Live model is overloaded right now. A fallback will take it.';
  if (/quota|rate|exhaust|429/i.test(reason)) {
    return 'The Live allowance for this minute is used up. A fallback will take it, or wait a minute.';
  }
  return `The Live session closed (${code})${reason ? `: ${reason}` : ''}.`;
}

/* -----------------------------------------------------------------------------
   Text jobs: the model speaks, and its speech comes back transcribed.
   -------------------------------------------------------------------------- */

export async function liveChat(apiKey: string, model: string, prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  let text = '';
  let session: any;

  const answer = new Promise<string>((resolve, reject) => {
    ai.live
      .connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          // Required by the extended-thinking model; "low" keeps the thinking
          // tokens out of the per-minute budget for jobs that do not need it.
          ...(model.includes('thinking') ? { thinkingConfig: { thinkingLevel: 'low' as any } } : {}),
          // Without this it behaves as a voice assistant. Given the tagging
          // prompt over a Greek entry it answered, in spoken Greek, "this
          // analysis requires care" — then half a minute later, unprompted,
          // "sorry, a system error occurred". With it: valid JSON three runs
          // out of three, Greek quotes surviving the speech round trip
          // character for character (25 Sep 2026).
          systemInstruction: {
            parts: [
              {
                text: 'You are a silent text-processing function inside a program, not a conversational assistant. Never greet, comment, apologise or explain. Read out ONLY the exact output the instructions ask for — character for character, including every brace, bracket and quotation mark — and nothing else.',
              },
            ],
          },
        },
        callbacks: {
          onmessage: (msg: any) => {
            const sc = msg.serverContent;
            if (sc?.outputTranscription?.text) text += sc.outputTranscription.text;
            // Some answers arrive as text parts even in audio mode.
            for (const p of sc?.modelTurn?.parts || []) if (p.text && !p.thought) text += p.text;
            // The transcript of the model's speech can trail the turnComplete
            // signal by a moment on longer answers. Resolving immediately cut
            // answers short; a short grace period does not.
            if (sc?.turnComplete) setTimeout(() => resolve(text), 1500);
          },
          onerror: (e: any) => reject(new LiveError(e?.message || String(e))),
          onclose: (e: any) => {
            if (e?.code && e.code !== 1000) reject(new LiveError(explainClose(e.code, e.reason || ''), e.code));
            else resolve(text);
          },
        },
      })
      .then(s => {
        session = s;
        s.sendClientContent({ turns: [{ role: 'user', parts: [{ text: prompt }] }], turnComplete: true });
      })
      .catch(err => reject(new LiveError(err?.message || String(err))));
  });

  try {
    const out = await withTimeout(answer, SESSION_TIMEOUT_MS, 'The Live model did not finish answering.');
    if (!out.trim()) throw new LiveError('The Live model answered with nothing.');
    return out.trim();
  } finally {
    try {
      session?.close();
    } catch {}
  }
}

/* -----------------------------------------------------------------------------
   Audio: recordings are converted to what Live wants, then streamed in.
   -------------------------------------------------------------------------- */

/** webm / mp4 / wav → 16 kHz mono PCM16. Needs ffmpeg on the machine running
 *  the server; the mini PC has it, a fresh Windows laptop often does not, and
 *  the caller falls back to a non-Live engine when this throws. */
export function toPcm16k(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1']);
    } catch (e: any) {
      return reject(new LiveError('ffmpeg is not installed, so the Live audio models cannot be used here.'));
    }
    const chunks: Buffer[] = [];
    let err = '';
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
    proc.on('error', () => reject(new LiveError('ffmpeg is not installed, so the Live audio models cannot be used here.')));
    proc.on('close', code => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new LiveError(`Could not convert the recording (${err.trim().slice(0, 160) || `ffmpeg exit ${code}`}).`));
    });
    proc.stdin.on('error', () => {});
    proc.stdin.end(input);
  });
}

async function streamAudio(session: any, pcm: Buffer) {
  // ~100 ms per chunk, as a microphone would send it. Faster than real time
  // is fine; one giant chunk is not.
  const chunk = 3200;
  for (let i = 0; i < pcm.length; i += chunk) {
    session.sendRealtimeInput({
      audio: { data: pcm.subarray(i, i + chunk).toString('base64'), mimeType: 'audio/pcm;rate=16000' },
    });
    await new Promise(r => setTimeout(r, 15));
  }
  // Two seconds of silence before the end marker. The interpreter translates
  // a sentence when its voice detection hears the sentence finish; a recording
  // that stops dead gives it no pause to hear, and on 25 Sep 2026 the last
  // sentence of a two-sentence test was simply never translated.
  const silence = Buffer.alloc(16000 * 2 * 2);
  for (let i = 0; i < silence.length; i += chunk) {
    session.sendRealtimeInput({
      audio: { data: silence.subarray(i, i + chunk).toString('base64'), mimeType: 'audio/pcm;rate=16000' },
    });
    await new Promise(r => setTimeout(r, 15));
  }
  session.sendRealtimeInput({ audioStreamEnd: true });
}

/** Speech → text, word for word. The answer is the model's record of what it
 *  heard, not a reply, and the session ending with 1008 is the normal finish. */
export async function liveTranscribe(apiKey: string, model: string, audio: Buffer): Promise<string> {
  const pcm = await toPcm16k(audio);
  const ai = new GoogleGenAI({ apiKey });
  let heard = '';
  let session: any;
  let idle: NodeJS.Timeout | undefined;

  const result = new Promise<string>((resolve, reject) => {
    const settle = () => resolve(heard);
    ai.live
      .connect({
        model,
        config: { responseModalities: [Modality.TEXT], inputAudioTranscription: {} },
        callbacks: {
          onmessage: (msg: any) => {
            const t = msg.serverContent?.inputTranscription?.text;
            if (t) {
              heard += t;
              clearTimeout(idle);
              idle = setTimeout(settle, 4000);
            }
            if (msg.serverContent?.turnComplete) settle();
          },
          onerror: (e: any) => (heard ? settle() : reject(new LiveError(e?.message || String(e)))),
          onclose: (e: any) => {
            if (heard) return settle();
            if (e?.code && e.code !== 1000 && e.code !== 1008) {
              reject(new LiveError(explainClose(e.code, e.reason || ''), e.code));
            } else settle();
          },
        },
      })
      .then(async s => {
        session = s;
        await streamAudio(s, pcm);
      })
      .catch(err => reject(new LiveError(err?.message || String(err))));
  });

  try {
    const out = await withTimeout(result, SESSION_TIMEOUT_MS, 'Live transcription did not finish.');
    if (!out.trim()) throw new LiveError('Live transcription heard nothing in the recording.');
    return out.trim();
  } finally {
    clearTimeout(idle);
    try {
      session?.close();
    } catch {}
  }
}

/** Speech in one language → English text, via an interpreter model that never
 *  announces it is done. Finished = four seconds with nothing new said after
 *  the audio has all been sent. */
export async function liveTranslateSpeech(apiKey: string, model: string, audio: Buffer): Promise<string> {
  const pcm = await toPcm16k(audio);
  const ai = new GoogleGenAI({ apiKey });
  let said = '';
  let session: any;
  let sentAll = false;
  let idle: NodeJS.Timeout | undefined;

  const result = new Promise<string>((resolve, reject) => {
    const bump = () => {
      clearTimeout(idle);
      idle = setTimeout(() => resolve(said), sentAll ? 9000 : 20000);
    };
    ai.live
      .connect({
        model,
        config: { responseModalities: [Modality.AUDIO], outputAudioTranscription: {} },
        callbacks: {
          onmessage: (msg: any) => {
            const t = msg.serverContent?.outputTranscription?.text;
            if (t) {
              said += t;
              bump();
            }
          },
          onerror: (e: any) => (said ? resolve(said) : reject(new LiveError(e?.message || String(e)))),
          onclose: (e: any) => {
            if (said) return resolve(said);
            if (e?.code && e.code !== 1000) reject(new LiveError(explainClose(e.code, e.reason || ''), e.code));
            else resolve(said);
          },
        },
      })
      .then(async s => {
        session = s;
        await streamAudio(s, pcm);
        sentAll = true;
        bump();
      })
      .catch(err => reject(new LiveError(err?.message || String(err))));
  });

  try {
    const out = await withTimeout(result, SESSION_TIMEOUT_MS, 'Live translation did not finish.');
    if (!out.trim()) throw new LiveError('Live translation produced nothing.');
    return out.trim();
  } finally {
    clearTimeout(idle);
    try {
      session?.close();
    } catch {}
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new LiveError(message)), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
