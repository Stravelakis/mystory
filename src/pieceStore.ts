/* The recording's 5-second pieces, kept in the browser until the server has
   them. Before this, a piece that failed three uploads in a row (server
   restarting, Wi-Fi gone for half a minute) was simply dropped, and every
   piece after it was refused as out of order. Now each piece is written here
   first and removed only once the server confirms it, so an outage costs a
   delay, and a closed tab sends what it still owed on the next visit. */

export interface StoredPiece {
  sid: string;
  seq: number;
  mime: string;
  blob: Blob;
}

const DB = 'mystory-pieces';
const STORE = 'pieces';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: ['sid', 'seq'] });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const putPiece = (p: StoredPiece) => run('readwrite', s => s.put(p)).then(() => undefined);
export const deletePiece = (sid: string, seq: number) => run('readwrite', s => s.delete([sid, seq])).then(() => undefined);
export const allPieces = () => run<StoredPiece[]>('readonly', s => s.getAll() as IDBRequest<StoredPiece[]>);

/** Recordings already uploaded whole: their pieces are no longer needed. */
const finished = new Set<string>();

/** The whole recording reached the server: drop its pieces, here and in flight. */
export async function finishRecording(sid: string): Promise<void> {
  finished.add(sid);
  try {
    for (const p of await allPieces()) if (p.sid === sid) await deletePiece(p.sid, p.seq);
  } catch {}
}

/** Sends one piece. 'ok' once the server has it (now or before), 'never' if
 *  it will not take it (it is missing an earlier piece), 'later' if it could
 *  not be reached within the attempts allowed. */
export async function uploadPiece(p: StoredPiece, maxAttempts = Infinity): Promise<'ok' | 'never' | 'later'> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (finished.has(p.sid)) return 'ok';
    try {
      const r = await fetch(`/api/recordings/${p.sid}/piece?seq=${p.seq}&mime=${encodeURIComponent(p.mime)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: p.blob,
      });
      if (r.ok) return 'ok';
      if (r.status === 409) {
        const d = await r.json().catch(() => ({}));
        // Expected a later piece: this one is already stored. An earlier one:
        // a gap that no retry of THIS piece can fill.
        return typeof d.expected === 'number' && d.expected > p.seq ? 'ok' : 'never';
      }
      if (r.status === 400) return 'never';
    } catch {}
    await new Promise(res => setTimeout(res, Math.min(30_000, 1500 * 2 ** Math.min(attempt, 5))));
  }
  return 'later';
}

/** Sends whatever earlier visits still owed, oldest first. Returns how many
 *  pieces reached the server. */
export async function flushPieces(skipSid?: string): Promise<number> {
  let pieces: StoredPiece[];
  try {
    pieces = await allPieces();
  } catch {
    return 0; // private window, storage blocked: nothing was kept, nothing to send
  }
  pieces.sort((a, b) => (a.sid === b.sid ? a.seq - b.seq : a.sid.localeCompare(b.sid)));
  let sent = 0;
  const dead = new Set<string>(); // unreachable now: keep for the next visit
  const refused = new Set<string>(); // the server can never take these
  for (const p of pieces) {
    if (p.sid === skipSid) continue;
    if (dead.has(p.sid)) continue;
    if (refused.has(p.sid)) {
      await deletePiece(p.sid, p.seq).catch(() => {});
      continue;
    }
    const got = await uploadPiece(p, 3);
    if (got === 'later') {
      dead.add(p.sid); // still unreachable: keep them all for the next visit
      continue;
    }
    if (got === 'ok') sent++;
    else refused.add(p.sid); // later pieces of this recording would be refused too
    await deletePiece(p.sid, p.seq).catch(() => {});
  }
  return sent;
}
