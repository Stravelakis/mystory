/* The life story: what has been told, what has not, the book written from it
   in the writer's own voice, and the way out to Video-Forge.

   Everything here is a button the writer presses. Nothing drafts, rewrites or
   exports by itself. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { selectStyle } from './Interviewer';

interface Row {
  slug: string;
  name: string;
  years: string;
  entries: number;
  words: number;
  thin: boolean;
  drafted: boolean;
  stale: boolean;
  partial: boolean;
}
interface Status {
  map: { updated: string; people: { name: string; who: string }[]; places: string[] } | null;
  rows: Row[];
  style: boolean;
}
interface Template {
  cast: string[];
  scriptPath: string;
}
interface Chapter {
  slug: string;
  title: string;
  text: string;
  status: 'partial' | 'complete';
  parts: number;
  done: number;
}

const CITE = /(\[(?:\d{8}-\d{6}-[a-z0-9]{3,6}[,;\s]*)+\])/g;

function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="frame cut">
      <span className="plate tl" />
      <span className="plate br" />
      <div className="bevel cut">
        <div className="face cut">
          <div className="phead">
            <span className="dmd" />
            <h3>{title}</h3>
            <span className="spacer" />
            {right}
          </div>
          <div className="pbody">{children}</div>
        </div>
      </div>
    </div>
  );
}

async function call(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({ success: false, error: `The server answered ${res.status}.` }));
  if (!data.success) throw new Error(data.error || `The server answered ${res.status}.`);
  return data;
}

export function StoryRoom(_: { key?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Chapter | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [speaker, setSpeaker] = useState(0);
  const [auto, setAuto] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const stop = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await call('/api/book'));
      setTemplate((await call('/api/export/template')).template);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
      void refresh();
    }
  };

  const read = (slug: string) =>
    run('Opening…', async () => {
      setOpen((await call(`/api/book/${encodeURIComponent(slug)}`)).chapter);
    });

  const draft = async (slug: string) => {
    await call('/api/book/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
  };

  const draftAll = () =>
    run('Writing…', async () => {
      stop.current = false;
      const todo = (status?.rows || []).filter(r => r.entries > 0 && (!r.drafted || r.stale || r.partial));
      for (let i = 0; i < todo.length && !stop.current; i++) {
        setBusy(`Writing ${i + 1} of ${todo.length}: ${todo[i].name}…`);
        await draft(todo[i].slug);
      }
    });

  const upload = (file: File | undefined) => {
    if (!file) return;
    void run('Reading the job…', async () => {
      const job = JSON.parse(await file.text());
      await call('/api/export/template', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job }) });
    });
  };

  const exportZip = (row: Row) =>
    run('Making the files…', async () => {
      setWarnings([]);
      const res = await fetch('/api/export/videoforge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'book', id: row.slug, speaker, backgrounds: auto ? 'auto' : 'none' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `The server answered ${res.status}.`);
      try {
        setWarnings(JSON.parse(decodeURIComponent(res.headers.get('X-Export-Warnings') || '[]')));
      } catch {}
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-forge-${row.slug}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });

  const rows = status?.rows || [];
  const noMap = !status?.map;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
      <Panel
        title="My life story"
        right={
          <button className="btn btn-sm cut-sm" disabled={!!busy} onClick={() => run('Reading your entries…', async () => void (await call('/api/book/map', { method: 'POST' })))}>
            {noMap ? 'Make the map' : 'Update the map'}
          </button>
        }
      >
        <p className="sec-note" style={{ marginBottom: 'var(--gap)' }}>
          The map groups what you have told by period of your life and shows where you have said little. Chapters are written in the first person, in
          your voice, only from your entries, and every paragraph names the entries it came from. Files are in <code>life/</code> and <code>book/</code> in your vault.
        </p>

        <div className="flex gap-2 flex-wrap items-center" style={{ marginBottom: 'var(--gap)' }}>
          <button className="btn btn-sm cut-sm" disabled={!!busy || noMap} onClick={() => run('Listening to how you talk…', async () => void (await call('/api/book/style', { method: 'POST' })))}>
            {status?.style ? 'Learn how I talk again' : 'Learn how I talk'}
          </button>
          <button className="btn btn-sm btn-primary cut-sm" disabled={!!busy || noMap} onClick={draftAll}>
            Write what is missing
          </button>
          {busy.startsWith('Writing') && (
            <button className="btn btn-sm cut-sm" onClick={() => (stop.current = true)}>
              Stop after this one
            </button>
          )}
          {busy && <span className="fhint" role="status">{busy}</span>}
        </div>
        {!status?.style && !noMap && <p className="fhint">Start with “Learn how I talk”, so the chapters sound like you.</p>}
        {error && (
          <div className="callout warn mb-6">
            <span className="cd" />
            <span>{error}</span>
          </div>
        )}

        {noMap ? (
          <div className="empty" style={{ padding: '3rem 1rem' }}>
            <span className="emptymark cut" />
            <span className="fhint">No map yet. Record a few entries, then press “Make the map”.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map(r => (
              <div key={r.slug} className="flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
                <div style={{ flex: '1 1 260px' }}>
                  <b>{r.name}</b> {r.years && <span className="fhint">({r.years})</span>}
                  <div className="fhint">
                    {r.entries} {r.entries === 1 ? 'entry' : 'entries'}, {r.words} words
                  </div>
                </div>
                <span className="tag">{r.thin ? 'thin: tell more' : 'covered'}</span>
                {r.drafted && <span className="tag">{r.partial ? 'partly written' : r.stale ? 'entries changed' : 'written'}</span>}
                <div className="flex gap-2">
                  {r.drafted && (
                    <button className="btn btn-sm cut-sm" disabled={!!busy} onClick={() => read(r.slug)}>
                      Read
                    </button>
                  )}
                  <button className="btn btn-sm cut-sm" disabled={!!busy || r.words === 0} onClick={() => run(`Writing ${r.name}…`, () => draft(r.slug))}>
                    {r.drafted ? 'Rewrite' : 'Write'}
                  </button>
                  {r.drafted && (
                    <button className="btn btn-sm cut-sm" disabled={!!busy || !template} title={template ? '' : 'Upload a Video-Forge job below first'} onClick={() => exportZip(r)}>
                      For Video-Forge
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {open && (
        <Panel
          title={open.title}
          right={
            <button className="btn btn-sm cut-sm" onClick={() => setOpen(null)}>
              Close
            </button>
          }
        >
          {open.status === 'partial' && (
            <p className="fhint">
              Part {open.done} of {open.parts} is written; press Write to finish it.
            </p>
          )}
          <div className="prose">
            {open.text.split(/\n{2,}/).map((para, i) => (
              <p key={i} className={i === 0 ? 'dropcap' : undefined} style={{ whiteSpace: 'pre-wrap' }}>
                {para.split(CITE).map((piece, j) =>
                  CITE.test(piece) ? (
                    <sup key={j} className="fhint" title="The entries this came from">
                      {'·'}
                    </sup>
                  ) : (
                    piece
                  ),
                )}
              </p>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Video-Forge">
        <p className="sec-note" style={{ marginBottom: 'var(--gap)' }}>
          “For Video-Forge” downloads two files: the script and the job. Video-Forge itself is never touched. Upload one of your own job files once (for
          example <code>101.1-final.json</code>); it carries your cast, voices and look, and every export is a copy of it with your story in place of its script.
        </p>
        <div className="flex gap-3 flex-wrap items-center">
          <label className="btn btn-sm cut-sm" style={{ cursor: 'pointer' }}>
            {template ? 'Use a different job file' : 'Upload a job file'}
            <input type="file" accept=".json,application/json" hidden onChange={e => upload(e.target.files?.[0])} />
          </label>
          {template && (
            <>
              <span className="fhint">Cast: {template.cast.join(', ')}</span>
              {template.cast.length > 1 && (
                <label className="flex items-center gap-2 fhint" style={{ margin: 0 }}>
                  Narrated by
                  <select style={selectStyle} value={speaker} onChange={e => setSpeaker(Number(e.target.value))}>
                    {template.cast.map((c, i) => (
                      <option key={c} value={i}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 fhint" style={{ margin: 0 }}>
                <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
                Let Video-Forge choose stock footage (off: plain background)
              </label>
            </>
          )}
        </div>
        {warnings.length > 0 && (
          <ul className="fhint" style={{ marginTop: 10, paddingLeft: 18 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </Panel>
    </motion.div>
  );
}
