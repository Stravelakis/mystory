/* =============================================================================
   LIVE LOCAL — words while speaking, from your own speech engine.

   The same contract as live.ts:openLiveTranscription (PCM16 at 16 kHz in,
   text out), but nothing is streamed to a cloud. The audio is cut at your
   pauses and each piece goes to engine/stt_engine.py: the laptop's when it is
   ready, the mini PC's otherwise. A slow speaker gets a sentence 1–5 s after
   pausing, which is the trade asked for: accuracy over speed.

   Pieces are sent one at a time and their text is emitted in the order spoken,
   whatever order the answers come back in. A piece that fails on every engine
   is skipped, never retried forever: the recording itself is saved separately
   (5 s pieces to vault/audio/partial/), and the careful pass after the session
   goes over all of it again. Live words are never the only copy of anything.
   ========================================================================== */

import type { LiveStream } from './live.ts';

const RATE = 16000;
const FRAME = RATE / 50; // 20 ms, in samples
const PRE_ROLL_FRAMES = 15; // 300 ms kept before the first loud frame
/** A pause this long ends a piece. Slow, thoughtful speech has shorter gaps
 *  inside sentences than this. */
const END_SILENCE_FRAMES = Number(process.env.LIVE_LOCAL_PAUSE_MS || 900) / 20;
const MAX_PIECE_FRAMES = (Number(process.env.LIVE_LOCAL_MAX_S || 15) * 1000) / 20;
const MIN_SPEECH_FRAMES = 10; // 200 ms of voice, or it was a click
/** Pieces waiting for the engine. Beyond this the engine is far behind; the
 *  oldest is dropped (the careful pass will have it). About 4 minutes. */
const MAX_QUEUE = 16;

export type PieceTranscriber = (wav: Buffer) => Promise<string>;

export function pcmToWav(pcm: Buffer, rate = RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function rms(frame: Buffer): number {
  let sum = 0;
  const n = frame.length >> 1;
  for (let i = 0; i < n; i++) {
    const v = frame.readInt16LE(i * 2);
    sum += v * v;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

/** Splits a PCM stream into spoken pieces at the pauses. Pure, so it can be
 *  tested without an engine. The noise floor adapts to the room. */
export class PauseSplitter {
  private carry = Buffer.alloc(0);
  private preRoll: Buffer[] = [];
  private piece: Buffer[] = [];
  private speech = 0;
  private silence = 0;
  private floor = 200;

  constructor(private onPiece: (pcm: Buffer) => void) {}

  push(chunk: Buffer): void {
    let buf = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk;
    const bytes = FRAME * 2;
    let at = 0;
    for (; at + bytes <= buf.length; at += bytes) this.frame(buf.subarray(at, at + bytes));
    this.carry = Buffer.from(buf.subarray(at));
  }

  /** Ends whatever piece is open. */
  flush(): void {
    if (this.piece.length && this.speech >= MIN_SPEECH_FRAMES) this.onPiece(Buffer.concat(this.piece));
    this.reset();
  }

  private reset(): void {
    this.piece = [];
    this.speech = 0;
    this.silence = 0;
  }

  private frame(f: Buffer): void {
    const level = rms(f);
    const loud = level > Math.max(this.floor * 3, 300);
    // The floor follows quiet frames only, so speech never raises it.
    if (!loud) this.floor = this.floor * 0.98 + level * 0.02;

    if (!this.piece.length) {
      if (loud) {
        this.piece = [...this.preRoll, Buffer.from(f)];
        this.preRoll = [];
        this.speech = 1;
      } else {
        this.preRoll.push(Buffer.from(f));
        if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
      }
      return;
    }

    this.piece.push(Buffer.from(f));
    if (loud) {
      this.speech++;
      this.silence = 0;
    } else {
      this.silence++;
    }
    if (this.silence >= END_SILENCE_FRAMES || this.piece.length >= MAX_PIECE_FRAMES) this.flush();
  }
}

export function openLocalLiveTranscription(opts: {
  transcribePiece: PieceTranscriber;
  onText: (text: string) => void;
  onState: (state: 'open' | 'reconnecting' | 'failed', detail?: string) => void;
}): LiveStream {
  const queue: Buffer[] = [];
  let working: Promise<void> | null = null;
  let closed = false;
  let failuresInARow = 0;

  const drain = async () => {
    while (queue.length && !closed) {
      const pcm = queue.shift()!;
      try {
        const text = (await opts.transcribePiece(pcmToWav(pcm))).trim();
        if (failuresInARow) opts.onState('open');
        failuresInARow = 0;
        if (text && !closed) opts.onText(text + ' ');
      } catch (e: any) {
        failuresInARow++;
        // Words pause; the recording does not. Say so once, not per piece.
        if (failuresInARow === 1) opts.onState('reconnecting', e?.message || String(e));
        if (failuresInARow === 3) opts.onState('failed', e?.message || String(e));
      }
    }
    working = null;
  };

  const splitter = new PauseSplitter(pcm => {
    if (closed) return;
    queue.push(pcm);
    if (queue.length > MAX_QUEUE) queue.shift();
    if (!working) working = drain();
  });

  opts.onState('open');

  return {
    send(pcm16k: Buffer) {
      if (!closed) splitter.push(pcm16k);
    },
    async finish() {
      splitter.flush();
      if (!working && queue.length) working = drain();
      if (working) await working;
    },
    close() {
      closed = true;
      queue.length = 0;
    },
  };
}
