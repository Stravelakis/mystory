/* The interviewer's controls, and the session log.

   Off by default, every time the page loads: switching it on is a decision
   made for this sitting, never remembered into the next. In "When I ask" it
   speaks only when a button is pressed. In "After a pause" it also asks once
   after the quiet the writer set (never while words are still arriving, and
   never twice in a row without new words in between). Questions are text on
   the screen. */

import { useCallback, useEffect, useRef, useState } from 'react';

export type InterviewerMode = 'off' | 'ask' | 'pause';

export interface InterviewNote {
  at: number;
  kind: 'question' | 'suggestion' | 'topic';
  text: string;
}

const OPENING = { el: 'Τι θα ήθελες να μου πεις σήμερα;', en: 'What would you like to talk about?' };
const SILENCE_KEY = 'mystory.interviewerSilence';
/** A native select, dressed to sit with the rest. */
export const selectStyle = { background: '#0a0907', color: 'var(--ink)', border: '1px solid var(--rule)', padding: '.3rem .5rem', font: 'inherit' } as const;

export const SILENCE_CHOICES = [15, 30, 45, 60, 90, 120];

function readSilence(): number {
  try {
    const n = Number(localStorage.getItem(SILENCE_KEY));
    return SILENCE_CHOICES.includes(n) ? n : 30;
  } catch {
    return 30;
  }
}

export interface Interviewer {
  mode: InterviewerMode;
  setMode: (m: InterviewerMode) => void;
  /** The key: off ↔ on, remembering which on-mode was last used. */
  toggle: () => void;
  silence: number;
  setSilence: (n: number) => void;
  topic: string;
  setTopic: (t: string) => void;
  question: string;
  history: string[];
  suggestions: string[];
  busy: boolean;
  error: string;
  notes: InterviewNote[];
  askNow: () => void;
  suggest: () => void;
  chooseTopic: (t: string) => void;
}

export function useInterviewer(o: { active: boolean; recording: boolean; transcript: string; language: string; elapsed: number }): Interviewer {
  const [mode, setModeState] = useState<InterviewerMode>('off');
  const [silence, setSilenceState] = useState(readSilence);
  const [topic, setTopicState] = useState('');
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<InterviewNote[]>([]);

  // Latest values for the timer and the requests, which outlive a render.
  const live = useRef(o);
  live.current = o;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const topicRef = useRef(topic);
  topicRef.current = topic;
  const historyRef = useRef(history);
  historyRef.current = history;
  const busyRef = useRef(false);
  const lastOn = useRef<InterviewerMode>('ask');
  const wordsAt = useRef(Date.now());
  /** True once new words have arrived since the last question. */
  const armed = useRef(false);

  const lang = o.language === 'en' ? 'en' : 'el';

  useEffect(() => {
    wordsAt.current = Date.now();
    armed.current = true;
  }, [o.transcript]);

  // The log is cleared when a session ENDS (the session log saves it as it
  // stops), so a question asked before pressing Begin belongs to that session.
  // Pausing and carrying on is the same session. The question on screen stays.
  const wasActive = useRef(false);
  useEffect(() => {
    if (!o.active && wasActive.current) {
      setHistory([]);
      setNotes([]);
      setSuggestions([]);
    }
    wasActive.current = o.active;
  }, [o.active]);

  const note = useCallback((kind: InterviewNote['kind'], text: string) => {
    setNotes(n => [...n, { at: live.current.elapsed, kind, text }]);
  }, []);

  const request = useCallback(
    async (kind: 'ask' | 'suggest') => {
      if (busyRef.current || modeRef.current === 'off') return;
      busyRef.current = true;
      setBusy(true);
      setError('');
      try {
        const r = await fetch('/api/interviewer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: kind,
            transcript: live.current.transcript,
            topic: topicRef.current,
            language: live.current.language === 'en' ? 'en' : 'el',
            recent: historyRef.current,
          }),
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'No answer.');
        // Switched off while the answer was on its way: stay silent.
        if (modeRef.current === 'off') return;
        if (kind === 'ask') {
          const q = String(d.lines?.[0] || '');
          if (q) {
            setQuestion(q);
            setHistory(h => [...h, q]);
            note('question', q);
            armed.current = false;
          }
        } else {
          setSuggestions(d.lines || []);
          note('suggestion', (d.lines || []).join(' / '));
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [note],
  );

  const setMode = useCallback(
    (m: InterviewerMode) => {
      setModeState(m);
      modeRef.current = m;
      if (m === 'off') return;
      lastOn.current = m;
      // Switching on says hello once, in words that cost nothing to answer.
      if (!question) {
        const q = OPENING[lang];
        setQuestion(q);
        setHistory(h => [...h, q]);
        note('question', q);
        armed.current = false;
      }
    },
    [lang, note, question],
  );

  const toggle = useCallback(() => setMode(modeRef.current === 'off' ? lastOn.current : 'off'), [setMode]);

  // "After a pause": quiet for as long as the writer set, words since the last
  // question, enough said to ask about, and not paused or finished.
  useEffect(() => {
    if (mode !== 'pause') return;
    const t = setInterval(() => {
      const l = live.current;
      if (!l.recording || busyRef.current || !armed.current) return;
      if (l.transcript.trim().length < 40) return;
      if (Date.now() - wordsAt.current < silence * 1000) return;
      void request('ask');
    }, 1000);
    return () => clearInterval(t);
  }, [mode, silence, request]);

  return {
    mode,
    setMode,
    toggle,
    silence,
    setSilence: n => {
      setSilenceState(n);
      try {
        localStorage.setItem(SILENCE_KEY, String(n));
      } catch {}
    },
    topic,
    setTopic: setTopicState,
    question: mode === 'off' ? '' : question,
    history,
    suggestions,
    busy,
    error,
    notes,
    askNow: () => void request('ask'),
    suggest: () => void request('suggest'),
    chooseTopic: t => {
      setTopicState(t);
      topicRef.current = t;
      if (t.trim()) note('topic', t.trim());
    },
  };
}

/** Writes the session's words and questions to the vault every few seconds. */
export function useSessionLog(o: { recording: boolean; sid: string; language: string; text: string; notes: InterviewNote[] }) {
  const latest = useRef(o);
  latest.current = o;
  const started = useRef('');

  useEffect(() => {
    if (!o.recording) return;
    started.current = new Date().toISOString();
    const save = () => {
      const l = latest.current;
      const text = l.text === 'Transcribing…' ? '' : l.text;
      // Questions asked count as something worth keeping even before any words.
      if (!l.sid || (!text.trim() && l.notes.length === 0)) return;
      void fetch(`/api/sessions/${l.sid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ started: started.current, language: l.language, text, notes: l.notes }),
        keepalive: true,
      }).catch(() => {});
    };
    const t = setInterval(save, 10_000);
    return () => {
      clearInterval(t);
      save(); // the last words, when it stops
    };
  }, [o.recording]);
}

export function InterviewerCard({ iv, compact = false }: { iv: Interviewer; compact?: boolean }) {
  const on = iv.mode !== 'off';
  const modes: [InterviewerMode, string][] = [
    ['off', 'Off'],
    ['ask', 'When I ask'],
    ['pause', 'After a pause'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: compact ? 'center' : 'left', alignItems: compact ? 'center' : 'stretch' }}>
      <div className="flex gap-2 flex-wrap" style={{ justifyContent: compact ? 'center' : 'flex-start' }} role="group" aria-label="Interviewer">
        {modes.map(([m, label]) => (
          <button key={m} type="button" className={`btn btn-sm cut-sm ${iv.mode === m ? 'btn-primary' : ''}`} aria-pressed={iv.mode === m} onClick={() => iv.setMode(m)}>
            {label}
          </button>
        ))}
        {iv.mode === 'pause' && (
          <label className="flex items-center gap-2 fhint" style={{ margin: 0 }}>
            quiet for
            <select style={selectStyle} value={iv.silence} onChange={e => iv.setSilence(Number(e.target.value))} aria-label="Seconds of quiet before a question">
              {SILENCE_CHOICES.map(n => (
                <option key={n} value={n}>
                  {n} s
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!on && <p className="fhint" style={{ margin: 0 }}>Nothing is asked unless you switch it on. Press I to switch it on or off.</p>}

      {on && (
        <>
          {iv.question && (
            <p aria-live="polite" style={{ margin: 0, fontSize: compact ? 'clamp(1.2rem, 2.6vw, 1.6rem)' : '1.15rem', lineHeight: 1.5, maxWidth: 720 }}>
              {iv.question}
            </p>
          )}
          {iv.history.length > 1 && !compact && (
            <ul className="fhint" style={{ margin: 0, paddingLeft: 18, opacity: 0.7 }}>
              {iv.history.slice(-4, -1).map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 flex-wrap items-center" style={{ justifyContent: compact ? 'center' : 'flex-start' }}>
            <span className="inwrap cut-sm" style={{ flex: '1 1 220px', minWidth: 220, maxWidth: 360 }}>
              <input
                className="input"
                type="text"
                value={iv.topic}
                onChange={e => iv.setTopic(e.target.value)}
                onBlur={e => iv.chooseTopic(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') iv.chooseTopic((e.target as HTMLInputElement).value);
                }}
                placeholder="I want to talk about…"
                aria-label="What I want to talk about"
              />
            </span>
            <button type="button" className="btn btn-sm cut-sm" disabled={iv.busy} onClick={iv.askNow}>
              Ask me
            </button>
            <button type="button" className="btn btn-sm cut-sm" disabled={iv.busy} onClick={iv.suggest}>
              Suggest topics
            </button>
          </div>

          {iv.suggestions.length > 0 && (
            <div className="flex gap-2 flex-wrap" style={{ justifyContent: compact ? 'center' : 'flex-start' }}>
              {iv.suggestions.map(s => (
                <button key={s} type="button" className="tag" style={{ cursor: 'pointer' }} onClick={() => iv.chooseTopic(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {iv.busy && <p className="fhint" style={{ margin: 0 }}>Thinking…</p>}
          {iv.error && <p role="alert" className="fhint" style={{ margin: 0, color: '#e0a09e' }}>{iv.error}</p>}
        </>
      )}
    </div>
  );
}
