// Words while speaking, from the local engine: the pause splitter and the
// order text comes out in, checked without an engine.
import { describe, it, expect } from 'vitest';
import { PauseSplitter, pcmToWav, openLocalLiveTranscription } from '../livelocal.ts';
import { engineNotReady, resolveProviders } from '../providers.ts';

const RATE = 16000;
function tone(seconds: number, amp = 6000): Buffer {
  const n = Math.round(seconds * RATE);
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amp * Math.sin((2 * Math.PI * 220 * i) / RATE)), i * 2);
  return b;
}
const quiet = (seconds: number) => tone(seconds, 20);

describe('PauseSplitter', () => {
  it('cuts one piece per spoken stretch, at the pauses', () => {
    const pieces: Buffer[] = [];
    const s = new PauseSplitter(p => pieces.push(p));
    s.push(Buffer.concat([quiet(1), tone(1.5), quiet(1.5), tone(2), quiet(1.5)]));
    expect(pieces.length).toBe(2);
    // The first piece holds the speech plus a short lead-in, not the silence before it.
    expect(pieces[0].length / 2 / RATE).toBeGreaterThan(1.5);
    expect(pieces[0].length / 2 / RATE).toBeLessThan(2.8);
  });

  it('ignores clicks and keeps silence out', () => {
    const pieces: Buffer[] = [];
    const s = new PauseSplitter(p => pieces.push(p));
    s.push(Buffer.concat([quiet(2), tone(0.06), quiet(2)]));
    s.flush();
    expect(pieces.length).toBe(0);
  });

  it('never holds a piece longer than the maximum', () => {
    const pieces: Buffer[] = [];
    const s = new PauseSplitter(p => pieces.push(p));
    s.push(tone(40));
    s.flush();
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    for (const p of pieces) expect(p.length / 2 / RATE).toBeLessThanOrEqual(15.01);
  });

  it('handles audio arriving in odd-sized chunks', () => {
    const pieces: Buffer[] = [];
    const s = new PauseSplitter(p => pieces.push(p));
    const all = Buffer.concat([quiet(0.5), tone(1), quiet(1.5)]);
    for (let i = 0; i < all.length; i += 777) s.push(all.subarray(i, i + 777));
    expect(pieces.length).toBe(1);
  });
});

describe('pcmToWav', () => {
  it('writes a 16 kHz mono WAV header', () => {
    const wav = pcmToWav(Buffer.alloc(3200));
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt32LE(40)).toBe(3200);
  });
});

describe('local live words', () => {
  it('emits text in the order spoken, even when answers come back out of order', async () => {
    const out: string[] = [];
    let n = 0;
    const stream = openLocalLiveTranscription({
      transcribePiece: async () => {
        const mine = ++n;
        await new Promise(r => setTimeout(r, mine === 1 ? 30 : 1));
        return `piece${mine}`;
      },
      onText: t => out.push(t.trim()),
      onState: () => {},
    });
    stream.send(Buffer.concat([tone(1), quiet(1.5), tone(1), quiet(1.5)]));
    await stream.finish();
    expect(out).toEqual(['piece1', 'piece2']);
  });

  it('keeps going after a failed piece, and says so', async () => {
    const out: string[] = [];
    const states: string[] = [];
    let n = 0;
    const stream = openLocalLiveTranscription({
      transcribePiece: async () => {
        if (++n === 1) throw new Error('engine paused');
        return 'second';
      },
      onText: t => out.push(t.trim()),
      onState: s => states.push(s),
    });
    stream.send(Buffer.concat([tone(1), quiet(1.5), tone(1), quiet(1.5)]));
    await stream.finish();
    expect(out).toEqual(['second']);
    expect(states).toContain('reconnecting');
    expect(states[states.length - 1]).toBe('open');
  });
});

describe('speech engine health', () => {
  it('reports an unreachable laptop quickly instead of waiting for a timeout', async () => {
    const [laptop] = resolveProviders({ LOCAL_STT_GPU_BASE_URL: 'http://127.0.0.1:9/v1' }).filter(p => p.id === 'local-stt-gpu');
    const started = Date.now();
    expect(await engineNotReady(laptop)).toMatch(/not reachable/);
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('leaves other providers alone', async () => {
    const [groq] = resolveProviders({ GROQ_API_KEY: 'x' }).filter(p => p.id === 'groq');
    expect(await engineNotReady(groq)).toBe('');
  });
});
