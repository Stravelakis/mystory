import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings,
  Mic,
  BookOpen,
  Save,
  StopCircle,
  RefreshCw,
  UploadCloud,
  FileText,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

/* =============================================================================
   DECO NOIR PRIMITIVES
   A clipped box cannot carry a border or a box-shadow — both get sheared off at
   the chamfer — which is why a panel is three nested layers and not one.
   ========================================================================== */

function Frame({
  title,
  headRight,
  children,
  className = '',
  lit = false,
}: {
  title?: string;
  headRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  lit?: boolean;
}) {
  return (
    <div className={`frame cut ${lit ? 'lit' : ''} ${className}`}>
      <span className="plate tl" />
      <span className="plate br" />
      <div className="bevel cut">
        <div className="face cut">
          {title && (
            <div className="phead">
              <span className="dmd" />
              <h3>{title}</h3>
              <span className="spacer" />
              {headRight}
            </div>
          )}
          <div className="pbody">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface PickerOption {
  value: string;
  label: string;
}
interface PickerGroup {
  label?: string;
  options: PickerOption[];
}

/* A native <select> cannot be chamfered, so the picker is a listbox. */
function Picker({
  value,
  onChange,
  groups,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: PickerGroup[];
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = groups.flatMap(g => g.options).find(o => o.value === value);

  return (
    <div className="picker" ref={ref}>
      <button
        type="button"
        id={id}
        className="picktrigger cut-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(o => !o)}
      >
        <span className="truncate text-left">{current ? current.label : 'Select…'}</span>
        <span className="chev" />
      </button>
      <div className="picklist cut-sm max-h-72 overflow-y-auto" hidden={!open} role="listbox">
        {groups.map((g, i) => (
          <React.Fragment key={g.label || i}>
            {g.label && <div className="clabel px-3 pt-3 pb-1">{g.label}</div>}
            {g.options.map(o => (
              <button
                key={o.value}
                type="button"
                role="option"
                className="pickopt"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  type = 'text',
  placeholder,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
  placeholder?: string;
  /** An API key. Hidden as you type, with a deliberate button to reveal it. */
  secret?: boolean;
}) {
  // A pasted key used to sit on screen in plain text until the page was
  // reloaded — long enough for a screen share, a photo, or someone walking
  // past. Secrets are hidden from the keystroke, and revealing one is a choice
  // you have to make.
  const [shown, setShown] = useState(false);
  const inputType = secret ? (shown ? 'text' : 'password') : type;

  return (
    <div className="field">
      <label>{label}</label>
      <span className="inwrap cut-sm" style={secret ? { display: 'flex', alignItems: 'center' } : undefined}>
        <input
          className="input"
          type={inputType}
          value={value}
          placeholder={placeholder}
          autoComplete={secret ? 'off' : undefined}
          autoCorrect={secret ? 'off' : undefined}
          spellCheck={secret ? false : undefined}
          onChange={e => onChange(e.target.value)}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShown(v => !v)}
            title={shown ? 'Hide' : 'Show'}
            aria-label={shown ? 'Hide this key' : 'Show this key'}
            style={{
              background: 'none',
              border: 0,
              cursor: 'pointer',
              color: 'var(--ink-3)',
              padding: '0 .6rem',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </span>
      {hint && <span className="fhint">{hint}</span>}
    </div>
  );
}

function SectionHead({ title, note, right }: { title: string; note?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="sechead">
        <h2>{title}</h2>
        <span className="rule" />
        {right}
      </div>
      {note && <p className="sec-note">{note}</p>}
    </div>
  );
}

/* =============================================================================
   LOCK SCREEN
   ========================================================================== */

function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (data.success) onUnlocked();
      else setError(data.error || 'That did not work.');
    } catch (err: any) {
      setError(err.message || 'Could not reach the vault.');
    } finally {
      setBusy(false);
      setPasscode('');
    }
  };

  return (
    <main className="wrap" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ width: 'min(420px, 100%)' }}>
        <div className="masthead">
          <div className="mast-in">
            <span className="decomark">
              <span className="ring" />
              <span className="bar" />
              <span className="dia" />
            </span>
            <span className="wordmark">
              <h1>My Story</h1>
              <p>Silent Vault</p>
            </span>
          </div>
        </div>

        <Frame title="Locked" lit>
          <form onSubmit={unlock}>
            <div className="field">
              <label htmlFor="passcode">Passcode</label>
              <span className="inwrap cut-sm">
                <input
                  id="passcode"
                  className="input"
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                />
              </span>
            </div>
            {error && (
              <div className="callout crit">
                <span className="cd" />
                <span>{error}</span>
              </div>
            )}
            <button className="btn btn-lg btn-primary cut-sm w-full" type="submit" disabled={busy || !passcode}>
              {busy ? 'Opening…' : 'Unlock'}
            </button>
          </form>
        </Frame>
      </div>
    </main>
  );
}

/* =============================================================================
   APP
   ========================================================================== */

type Tab = 'journal' | 'synthesis' | 'settings';

interface GoogleStatus {
  /** A refresh token is stored, so archiving will keep working indefinitely. */
  connected: boolean;
  email: string;
  /** An OAuth client id and secret have been entered. */
  configured: boolean;
}

export default function App() {
  // Before anything renders, so the identity never flashes the wrong colour.
  const [appearance, setAppearance] = useState(readAppearance);
  useEffect(() => {
    applyAppearance(appearance.way, appearance.dress);
  }, [appearance]);

  // ?tab=synthesis deep-links a surface, which is handy on a headless box you
  // only ever reach by URL.
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'synthesis' || t === 'settings' ? t : 'journal';
  });
  const [google, setGoogle] = useState<GoogleStatus>({ connected: false, email: '', configured: false });
  const [gate, setGate] = useState<{ locked: boolean; authed: boolean } | null>(null);

  const readGate = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setGate({ locked: Boolean(data.locked), authed: Boolean(data.authed) });
    } catch (e) {
      // If the status endpoint cannot be reached there is nothing to show
      // anyway; treat it as open rather than stranding the user on a lock
      // screen they cannot pass.
      setGate({ locked: false, authed: true });
    }
  };

  useEffect(() => {
    void readGate();
  }, []);

  const [alertMessage, setAlertMessage] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const triggerAlert = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setAlertMessage({ message, type });
    setTimeout(() => setAlertMessage(null), 5000);
  };

  // The server holds the Google credential; the client only ever asks whether
  // one exists.
  const readGoogle = async () => {
    try {
      const data = await (await fetch('/api/google/status')).json();
      setGoogle({
        connected: Boolean(data.connected),
        email: data.email || '',
        configured: Boolean(data.configured),
      });
    } catch (e) {
      setGoogle({ connected: false, email: '', configured: false });
    }
  };

  useEffect(() => {
    if (gate && (!gate.locked || gate.authed)) void readGoogle();
  }, [gate]);

  const handleLinkGoogle = async () => {
    try {
      const data = await (await fetch('/api/google/url')).json();
      if (!data.success) return triggerAlert(data.error || 'Could not start linking.', 'error');

      const popup = window.open(data.url, 'google-link', 'width=520,height=680');
      if (!popup) return triggerAlert('The browser blocked the linking window.', 'error');

      // The callback page posts back to this origin when it is done.
      const onMessage = (e: MessageEvent) => {
        if (e.origin !== window.location.origin || e.data?.type !== 'GOOGLE_LINK_DONE') return;
        window.removeEventListener('message', onMessage);
        void readGoogle().then(() => {
          if (e.data.ok) triggerAlert('Google account linked.', 'success');
        });
      };
      window.addEventListener('message', onMessage);

      // A popup closed by hand sends nothing, so re-read the status either way.
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          window.removeEventListener('message', onMessage);
          void readGoogle();
        }
      }, 700);
    } catch (err: any) {
      triggerAlert('Google linking failed: ' + (err.message || err), 'error');
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch('/api/google/disconnect', { method: 'POST' });
      await readGoogle();
      triggerAlert('Google account unlinked.', 'info');
    } catch (err: any) {
      console.error('Disconnect error:', err);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'journal', label: 'Vault', icon: <Mic className="w-4 h-4" /> },
    { id: 'synthesis', label: 'Synthesis', icon: <RefreshCw className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  // Nothing renders until we know whether the vault is locked — a flash of the
  // journal before the lock screen would defeat the point of it.
  if (!gate) return null;
  if (gate.locked && !gate.authed) return <LockScreen onUnlocked={() => setGate({ locked: true, authed: true })} />;

  return (
    <>
      {/* Toast. .toaststack is absolute by default; fixed keeps it on screen
          while the page scrolls. */}
      <div className="toaststack" style={{ position: 'fixed' }}>
        <AnimatePresence>
          {alertMessage && (
            <motion.div
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
            >
              <div className="frame toast cut">
                <span className="plate tl" />
                <span className="plate br" />
                <div className="bevel cut">
                  <div className="face cut">
                    <div className="pbody flex items-center gap-3">
                      <span
                        className={
                          alertMessage.type === 'error'
                            ? 'tag crit'
                            : alertMessage.type === 'success'
                              ? 'tag good'
                              : 'tag'
                        }
                      >
                        {alertMessage.type !== 'info' && <i />}
                        {alertMessage.type === 'error' ? 'Fault' : alertMessage.type === 'success' ? 'Done' : 'Note'}
                      </span>
                      <span>{alertMessage.message}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sticky control bar: wordmark + tabs */}
      <div className="controls">
        <div className="controls-in">
          <div className="flex items-center gap-3">
            <span className="decomark">
              <span className="ring" />
              <span className="bar" />
              <span className="dia" />
            </span>
            <span className="wordmark text-left">
              <h1 style={{ fontSize: 'var(--step-1)' }}>My Story</h1>
            </span>
          </div>
          <span className="flex-1" />
          <div className="tabs" role="tablist">
            {tabs.map(t => (
              <button
                key={t.id}
                role="tab"
                className="tab flex items-center gap-2"
                aria-selected={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="wrap">
        <AnimatePresence mode="wait">
          {activeTab === 'journal' && (
            <JournalRoom
              key="journal"
              google={google}
              onLinkGoogle={handleLinkGoogle}
              triggerAlert={triggerAlert}
            />
          )}
          {activeTab === 'synthesis' && <SynthesisStudio key="synthesis" google={google} />}
          {activeTab === 'settings' && (
            <SettingsCenter
              key="settings"
              google={google}
              onLinkGoogle={handleLinkGoogle}
              onDisconnect={handleDisconnect}
              onGoogleChanged={readGoogle}
              appearance={appearance}
              onAppearance={setAppearance}
            />
          )}
        </AnimatePresence>
      </main>
    </>
  );
}

/* =============================================================================
   VAULT
   ========================================================================== */

const DRAFT_KEY = 'mystory.draft';
/** Below this, a stray keystroke is not worth a file of its own. */
const DRAFT_MIN_CHARS = 40;

interface Occurred {
  text?: string;
  start?: string;
  end?: string;
  confidence?: 'stated' | 'anchored' | 'inferred' | 'unknown';
}

/** How sure the app is about when something happened, said in words rather
 *  than jargon. The writer's own phrasing always outranks any of it. */
const CONFIDENCE_NOTE: Record<string, string> = {
  stated: 'You said when.',
  anchored: 'Placed next to something else you dated.',
  inferred: 'Worked out from what you wrote. Correct it if it is wrong.',
  unknown: 'Not placed yet. It will sort by when you wrote it until then.',
};

/** "2011" and "2011-06" are both legitimate answers, so a range is shown as
 *  written rather than turned into a false-precision date. */
const showRange = (o?: Occurred) => {
  if (!o?.start && !o?.end) return '';
  if (o.start && o.end && o.start === o.end) return o.start;
  return [o.start, o.end].filter(Boolean).join(' → ');
};

interface VaultEntry {
  id: string;
  title: string;
  created: string;
  updated: string;
  indicators: string[];
  found?: { id: string; evidence?: string }[];
  occurred?: Occurred;
  english?: string;
  verbatim?: string;
  audio?: string;
  drive?: string;
  text: string;
}
interface Indicator {
  id: string;
  label: string;
  category: 'pattern' | 'role' | 'response' | 'protection';
  definition: string;
  evidence?: string;
}

/** Grouping headings. A coping response filed next to a tactic done to you is
 *  a category error, and reads like an accusation. */
const CATEGORY_LABEL: Record<Indicator['category'], string> = {
  pattern: 'Done to me',
  role: 'Position in the system',
  response: 'How I survived it',
  protection: 'What protected me',
};
const CATEGORY_ORDER: Indicator['category'][] = ['pattern', 'role', 'response', 'protection'];

interface VaultSummary extends Omit<VaultEntry, 'text'> {
  excerpt: string;
  words: number;
}

const shortDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' });
};
const shortTime = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

interface JournalRoomProps {
  key?: string;
  google: GoogleStatus;
  onLinkGoogle: () => any;
  triggerAlert: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

interface ProviderInfo {
  id: string;
  label: string;
  local: boolean;
  kind: string;
  baseUrl: string;
  reachable: boolean | null;
  models: string[];
  error?: string;
  blocked?: boolean;
}
interface TaskInfo {
  id: string;
  label: string;
  blurb: string;
}
interface ProvidersState {
  routing: string;
  localOnly: boolean;
  cloudConsent?: boolean;
  providers: ProviderInfo[];
  loaded: boolean;
  tasks: TaskInfo[];
  assignments: Record<string, { providerId: string; model: string }[]>;
  synthesis: { label: string; local: boolean; options: { value: string; label: string }[] }[];
}

/* =============================================================================
   APPEARANCE

   Deco Noir already carries three colourways and three dresses; which one is
   in use belongs to the person using the app, not to index.html.

   Kept in localStorage rather than .env on purpose: this is a property of the
   screen you are sitting at, not of the vault. The same vault reached from a
   phone at night and a desktop in daylight should be allowed to look
   different.
   ========================================================================== */

const WAYS = [
  { id: 'oxblood', label: 'Oxblood', note: 'The default. Deep red under a low key light.' },
  { id: 'jade', label: 'Jade', note: 'Cooler, greener, further from the colour of alarm.' },
  { id: 'nickel', label: 'Nickel', note: 'Grey and quiet. The least present of the three.' },
];

const DRESSES = [
  { id: 'full', label: 'Full', note: 'Every flourish the identity has.' },
  { id: 'working', label: 'Working', note: 'Fewer ornaments, same bones. Easier on a long session.' },
  { id: 'plain', label: 'Plain', note: 'Geometry only. The quietest it gets.' },
];

const APPEARANCE_KEY = 'mystory.appearance';

function readAppearance(): { way: string; dress: string } {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return {
        way: WAYS.some(w => w.id === v.way) ? v.way : 'oxblood',
        dress: DRESSES.some(d => d.id === v.dress) ? v.dress : 'full',
      };
    }
  } catch {
    // A cleared or blocked store is not an error; the default look is fine.
  }
  return { way: 'oxblood', dress: 'full' };
}

function applyAppearance(way: string, dress: string) {
  document.documentElement.setAttribute('data-way', way);
  document.documentElement.setAttribute('data-dress', dress);
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ way, dress }));
  } catch {
    // Losing the preference costs a re-pick, not a session.
  }
}

const NO_PROVIDERS: ProvidersState = {
  routing: 'cloud-first',
  localOnly: false,
  providers: [],
  loaded: false,
  tasks: [],
  assignments: {},
  synthesis: [],
};

/** Which models exist is a question for the endpoint, never a list baked into
 *  this bundle — providers rename and retire them faster than this app ships,
 *  and a hardcoded id becomes the user's 404. `load` asks them. */
function useProviders(): [ProvidersState, (load?: boolean) => Promise<void>, boolean] {
  const [state, setState] = useState<ProvidersState>(NO_PROVIDERS);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (deep = false) => {
    if (deep) setLoading(true);
    try {
      const r = await fetch(`/api/providers${deep ? '?load=1' : ''}`);
      const d = await r.json();
      if (d.success) setState(d);
    } catch {
      // Settings still has to render. The panel says what is unreachable.
    } finally {
      if (deep) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(false);
  }, [load]);
  return [state, load, loading];
}

/** Transcription engines that are actually configured, plus Auto. */
function engineGroups(p: ProvidersState): PickerGroup[] {
  const stt = p.providers.filter(
    x => x.id === 'groq' || x.id === 'gemini' || x.id === 'local-stt' || x.id === 'omniroute',
  );
  const label: Record<string, string> = {
    groq: 'Groq Whisper large v3',
    gemini: 'Gemini native audio',
    'local-stt': 'Local Whisper',
    omniroute: 'OmniRoute (returns English)',
  };
  return [
    {
      options: [
        { value: 'auto', label: stt.length ? 'Auto — first that answers' : 'Auto — nothing configured' },
        ...stt.map(x => ({ value: x.id, label: label[x.id] || x.label })),
      ],
    },
  ];
}

/** Corrected is the default. Reading your own speech back with every "um" in
 *  it is its own small discouragement, and the verbatim version is kept on
 *  disk either way — so the safe choice is the readable one. */
const STYLES: PickerGroup[] = [
  {
    options: [
      { value: 'corrected', label: 'Tidied — fillers and false starts removed' },
      { value: 'verbatim', label: 'Word for word — exactly as spoken' },
    ],
  },
];

const LANGUAGES: PickerGroup[] = [
  {
    options: [
      { value: 'auto', label: 'Auto (detect)' },
      { value: 'el', label: 'Greek' },
      { value: 'en', label: 'English' },
    ],
  },
];

function JournalRoom({ google, onLinkGoogle, triggerAlert }: JournalRoomProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [language, setLanguage] = useState('auto');
  const [engine, setEngine] = useState('auto');
  const [detectedTags, setDetectedTags] = useState<string[]>([]);
  const [detectedIndicators, setDetectedIndicators] = useState<Indicator[]>([]);
  const [style, setStyle] = useState<string>(() => localStorage.getItem('mystory.style') || 'corrected');
  const styleRef = useRef(style);
  useEffect(() => {
    styleRef.current = style;
    try {
      localStorage.setItem('mystory.style', style);
    } catch {
      // A blocked store costs the preference, not the recording.
    }
  }, [style]);
  const [verbatim, setVerbatim] = useState('');
  const [showVerbatim, setShowVerbatim] = useState(false);

  const [occurred, setOccurred] = useState<Occurred>({});
  const [datingBusy, setDatingBusy] = useState(false);
  const [english, setEnglish] = useState('');
  const [englishBy, setEnglishBy] = useState<'deepl' | 'model' | 'gemini-live' | null>(null);
  const [translating, setTranslating] = useState(false);
  const [providers] = useProviders();
  const [aiResponse, setAiResponse] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveLink, setArchiveLink] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [wsReady, setWsReady] = useState(false);

  // Local vault
  const [entryId, setEntryId] = useState<string | null>(null);
  const [entries, setEntries] = useState<VaultSummary[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  const lastSavedRef = useRef('');

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // MediaRecorder.onstop fires from a closure captured when recording started,
  // so anything it reads must come from a ref or it reads a stale render.
  const sessionNameRef = useRef(sessionName);
  const tagsRef = useRef(detectedTags);
  const connectedRef = useRef(google.connected);
  const engineRef = useRef(engine);
  const languageRef = useRef(language);
  useEffect(() => {
    sessionNameRef.current = sessionName;
  }, [sessionName]);
  useEffect(() => {
    tagsRef.current = detectedTags;
  }, [detectedTags]);
  useEffect(() => {
    connectedRef.current = google.connected;
  }, [google.connected]);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const refreshEntries = async () => {
    try {
      const res = await fetch('/api/vault/entries');
      const data = await res.json();
      if (data.success) setEntries(data.entries || []);
    } catch (e) {
      console.error('Could not read the vault:', e);
    }
  };

  const signature = () =>
    JSON.stringify([entryId, sessionName, transcript, detectedTags, occurred]);

  /** Writes the entry to disk on this machine. Everything else — Drive, models
   *  — is downstream of this having already happened. */
  const persist = async (extra: { drive?: string } = {}) => {
    if (!transcript.trim() && !entryId) return null;
    const sig = signature();
    try {
      const res = await fetch('/api/vault/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entryId ?? undefined,
          title: sessionName || undefined,
          text: transcript,
          indicators: detectedTags,
          // The quotes go to disk with the entry. Recomputing them later would
          // ask a different model a different question and get a different
          // answer, which is not what a record is for.
          found: detectedIndicators.map(i => ({ id: i.id, evidence: i.evidence })),
          occurred,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'The vault refused the write.');
      lastSavedRef.current = sig;
      setEntryId(data.entry.id);
      setSavedAt(data.entry.updated);
      void refreshEntries();
      return data.entry as VaultEntry;
    } catch (e: any) {
      console.error('Vault save failed:', e);
      triggerAlert('Could not write to the vault: ' + (e.message || e), 'error');
      return null;
    }
  };

  useEffect(() => {
    void refreshEntries();
  }, []);

  // Draft recovery. localStorage is the belt to the vault's braces: it survives
  // a reload of a half-typed entry that is not yet worth a file.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d?.text === 'string' && d.text.trim()) {
        setTranscript(d.text);
        setSessionName(d.title || '');
        setEntryId(d.entryId || null);
        setRecovered(true);
      }
    } catch (e) {
      /* a corrupt draft is not worth failing a page load over */
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (transcript.trim()) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ entryId, title: sessionName, text: transcript }));
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      } catch (e) {
        /* private mode, quota — the vault is the real safety net */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [transcript, sessionName, entryId]);

  // Autosave to the vault once the text is worth a file and has been still for
  // a moment. An entry that already exists keeps being updated regardless.
  useEffect(() => {
    if (isRecording) return; // the recorder saves on stop
    if (!entryId && transcript.trim().length < DRAFT_MIN_CHARS) return;
    if (signature() === lastSavedRef.current) return;
    const timer = setTimeout(() => void persist(), 4000);
    return () => clearTimeout(timer);
  }, [transcript, sessionName, detectedTags, entryId, isRecording]);

  const openEntry = async (id: string) => {
    try {
      const res = await fetch(`/api/vault/entries/${id}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const e: VaultEntry = data.entry;
      setEntryId(e.id);
      setSessionName(e.title === 'Untitled' || e.title === 'Untitled recording' ? '' : e.title);
      setTranscript(e.text);
      setDetectedTags(e.indicators || []);
      setOccurred(e.occurred || {});
      setEnglish(e.english || '');
      setVerbatim(e.verbatim || '');
      setShowVerbatim(false);
      setEnglishBy(null);
      setArchiveLink(e.drive || null);
      setArchiveError(null);
      setAiResponse('');
      setSavedAt(e.updated);
      setRecovered(false);
      lastSavedRef.current = '';
    } catch (e: any) {
      triggerAlert('Could not open that entry: ' + (e.message || e), 'error');
    }
  };

  const newEntry = () => {
    setEntryId(null);
    setSessionName('');
    setTranscript('');
    setDetectedTags([]);
    setArchiveLink(null);
    setArchiveError(null);
    setAiResponse('');
    setSavedAt(null);
    setRecovered(false);
    lastSavedRef.current = '';
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
  };

  const trashEntry = async (id: string) => {
    try {
      await fetch(`/api/vault/entries/${id}/trash`, { method: 'POST' });
      if (id === entryId) newEntry();
      void refreshEntries();
      triggerAlert('Moved to the vault trash. The file is still on disk.', 'info');
    } catch (e: any) {
      triggerAlert('Could not move that entry: ' + (e.message || e), 'error');
    }
  };

  /** Render the entry in English, beside the original rather than over it. */
  const translateIt = async () => {
    if (!transcript.trim()) return;
    setTranslating(true);
    try {
      const res = await fetch('/api/journal/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, id: entryId ?? undefined }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Translation failed.');
      setEnglish(data.text);
      setEnglishBy(data.engine);
      void refreshEntries();
    } catch (e: any) {
      triggerAlert('Could not translate: ' + (e.message || e), 'error');
    } finally {
      setTranslating(false);
    }
  };

  /** Ask what the entry says about when it happened. Never automatic: it
   *  costs a model call, and being asked "when was this?" unprompted while you
   *  are still writing is the opposite of what this app is for. */
  const dateIt = async () => {
    if (!transcript.trim()) return;
    setDatingBusy(true);
    try {
      const res = await fetch('/api/journal/when', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript }),
      });
      const data = await res.json();
      const got = data.occurred || {};
      if (!got.text && !got.start && !got.end) {
        triggerAlert('Nothing in the entry says when this happened. You can type it yourself.', 'info');
      }
      // Merged, so a model finding a range cannot wipe words you typed.
      setOccurred(prev => ({ ...prev, ...got }));
    } catch (e: any) {
      triggerAlert('Could not work out when: ' + (e.message || e), 'error');
    } finally {
      setDatingBusy(false);
    }
  };

  // Debounced live tagging
  useEffect(() => {
    if (!transcript.trim() || transcript.length < 10) {
      setDetectedTags([]);
      setDetectedIndicators([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/journal/analyze-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript }),
        });
        const data = await res.json();
        if (data.tags && data.tags.length > 0) setDetectedTags(data.tags);
        if (Array.isArray(data.indicators)) setDetectedIndicators(data.indicators);
      } catch (e) {
        console.error('Failed to fetch indicators:', e);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [transcript]);

  // Companion socket, with reconnect — a silently dead socket used to leave both
  // companion keys doing nothing at all.
  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/journal`);
      wsRef.current = ws;
      // A superseded socket must not speak for the live one. Its close event can
      // land after the replacement is already open.
      const isCurrent = () => wsRef.current === ws;
      ws.onopen = () => {
        if (isCurrent()) setWsReady(true);
      };
      ws.onclose = () => {
        if (!isCurrent()) return;
        setWsReady(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'audio_response') setAiResponse(data.text);
        } catch (e) {
          console.error('WS parsing error:', e);
        }
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    // ONE stream. Asking twice left the first one open, so the microphone stayed
    // lit after recording had stopped.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch (err) {
      console.error('Microphone permission error:', err);
      triggerAlert(
        'Microphone blocked. Open the app in its own browser tab so it can ask for permission.',
        'error',
      );
      return;
    }

    setIsRecording(true);
    setTranscript('');
    setArchiveLink(null);
    setArchiveError(null);
    audioChunksRef.current = [];

    // A. Web Speech API — fast interim text on screen
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      if (language !== 'auto') recognitionRef.current.lang = language === 'el' ? 'el-GR' : 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let finalResult = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalResult += event.results[i][0].transcript;
        }
        if (finalResult) {
          setTranscript(prev => {
            const cleanedPrev = prev.trim();
            const cleanedNew = finalResult.trim();
            if (cleanedPrev.endsWith(cleanedNew)) return prev;
            return cleanedPrev ? cleanedPrev + ' ' + cleanedNew : cleanedNew;
          });
        }
      };
      recognitionRef.current.onerror = (e: any) => console.error('Speech Recognition Error:', e.error);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('SpeechRecognition start error:', e);
      }
    }

    // B. MediaRecorder — the high-quality pass that actually gets transcribed
    try {
      // Safari on iOS records MP4 and nothing else; Chrome and Firefox
      // prefer WebM/Opus. Asking for a container the device cannot produce
      // throws, and hardcoding one it did not produce mislabels the file — so
      // the device is asked what it can do and the answer is carried through
      // to the upload.
      const preferred = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const supported =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? preferred.find(t => MediaRecorder.isTypeSupported(t))
          : undefined;

      const mediaRecorder = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        // The recorder is the authority on what it just produced.
        const recordedType = mediaRecorder.mimeType || supported || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedType });
        stopStream();
        if (audioBlob.size <= 1000) return;

        setTranscript(prev => prev || 'Transcribing…');
        // Text fields before the file: that is the order multer expects.
        const formData = new FormData();
        formData.append('engine', engineRef.current);
        formData.append('language', languageRef.current);
        formData.append('style', styleRef.current);
        const ext = recordedType.includes('mp4') ? 'm4a' : recordedType.includes('ogg') ? 'ogg' : 'webm';
        formData.append('audio', audioBlob, `recording.${ext}`);

        try {
          const res = await fetch('/api/journal/transcribe-audio', { method: 'POST', body: formData });
          const data = await res.json();
          // The server has already written the recording and an entry to hold
          // it, so adopt that id whether or not the transcription worked.
          if (data.entryId) setEntryId(data.entryId);
          if (data.success && data.transcript) {
            setTranscript(data.transcript);
            setVerbatim(data.verbatim || '');
            setShowVerbatim(false);
            setSavedAt(data.entry?.updated || new Date().toISOString());
            await handleAutoArchive(data.transcript, data.entryId);
          } else {
            triggerAlert(
              (data.error || 'Transcription failed.') +
                (data.audioKept ? ' The recording itself is safe in the vault.' : ''),
              'error',
            );
            setTranscript(prev => (prev === 'Transcribing…' ? '' : prev));
          }
          void refreshEntries();
        } catch (err: any) {
          console.error('Transcription error:', err);
          triggerAlert('Transcription failed: ' + (err.message || err), 'error');
          void refreshEntries();
        }
      };

      mediaRecorder.start();
    } catch (err) {
      console.error('MediaRecorder start failed:', err);
      stopStream();
      setIsRecording(false);
      triggerAlert(
        'Could not start the recorder on this device. On iPhone, recording needs Safari over https — a Tailscale https hostname works.',
        'error',
      );
    }
  };

  const handleAutoArchive = async (textToArchive: string, id?: string) => {
    if (!textToArchive.trim()) return;

    let generatedTitle = sessionNameRef.current;
    if (!generatedTitle || generatedTitle === 'Untitled Memory' || generatedTitle === 'Generating Title...') {
      try {
        const res = await fetch('/api/journal/autotitle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: textToArchive }),
        });
        const data = await res.json();
        generatedTitle = data.title || 'Auto Saved Entry';
      } catch (e) {
        generatedTitle = 'Auto Saved Entry';
      }
      setSessionName(generatedTitle);
    }

    // The title lands on disk before Drive is even attempted.
    try {
      const res = await fetch('/api/vault/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id ?? undefined,
          title: generatedTitle,
          text: textToArchive,
          indicators: tagsRef.current,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEntryId(data.entry.id);
        setSavedAt(data.entry.updated);
        id = data.entry.id;
      }
      void refreshEntries();
    } catch (e) {
      console.error('Vault save after transcription failed:', e);
    }

    if (!connectedRef.current) return; // no Drive link is fine — the entry is already safe
    await archiveAsDoc(generatedTitle.trim(), textToArchive, tagsRef.current, id);
  };

  const archiveAsDoc = async (title: string, body: string, tags: string[], id?: string) => {
    setIsArchiving(true);
    setArchiveLink(null);
    setArchiveError(null);
    const tagsInfo = tags.length > 0 ? `\n\n[Live Indicators Detected: ${tags.join(', ')}]` : '';
    const formattedContent = `${title}\nCreated: ${new Date().toLocaleString()}${tagsInfo}\n\n${body}`;
    try {
      const res = await fetch('/api/drive/create-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: formattedContent }),
      });
      const data = await res.json();
      if (data.success && data.viewUrl) {
        setArchiveLink(data.viewUrl);
        // Record where the mirror lives, on the entry itself.
        const targetId = id ?? entryId;
        if (targetId) {
          await fetch('/api/vault/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: targetId, drive: data.viewUrl }),
          }).catch(() => {});
          void refreshEntries();
        }
      } else {
        setArchiveError(data.error || 'Could not save to Google Docs.');
      }
    } catch (e: any) {
      setArchiveError(e.message || 'Failed to contact Drive services.');
    } finally {
      setIsArchiving(false);
    }
  };

  const companion = (type: 'speak_trigger_opinion' | 'speak_trigger_more') => {
    if (!transcript.trim()) {
      triggerAlert('Write or speak something first.', 'info');
      return;
    }
    setAiResponse('Thinking…');
    wsRef.current?.send(JSON.stringify({ type, transcript }));
  };

  const autoTitle = async () => {
    if (!transcript.trim()) return;
    setSessionName('Generating Title...');
    try {
      const res = await fetch('/api/journal/autotitle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      setSessionName(data.title || 'My Story Entry');
    } catch (e) {
      setSessionName('My Story Entry');
    }
  };

  const saveToGoogleDocs = async () => {
    if (!google.connected) return triggerAlert('Link a Google account first.', 'info');
    if (!transcript.trim()) return triggerAlert('The vault is empty. Write or speak something first.', 'info');
    const title = sessionName.trim() || `My Story Reflections — ${new Date().toLocaleDateString()}`;
    const entry = await persist(); // disk first, always
    await archiveAsDoc(title, transcript, detectedTags, entry?.id ?? entryId ?? undefined);
  };

  const saveToDriveMarkdown = async () => {
    if (!google.connected) return triggerAlert('Link a Google account first.', 'info');
    if (!transcript.trim()) return triggerAlert('The vault is empty. Write or speak something first.', 'info');

    const saved = await persist(); // disk first, always

    setIsArchiving(true);
    setArchiveLink(null);
    setArchiveError(null);

    const title = sessionName.trim() || `My_Story_${Date.now()}`;
    const filename = `${title.replace(/\s+/g, '_')}.md`;
    const tagsInfo = detectedTags.length > 0 ? `\n\n[Live Indicators: ${detectedTags.join(', ')}]` : '';
    const markdownBody = `# ${title}\n*Created: ${new Date().toLocaleString()}* ${tagsInfo}\n\n${transcript}`;

    try {
      const res = await fetch('/api/drive/upload-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: markdownBody, mimeType: 'text/markdown' }),
      });
      const data = await res.json();
      if (data.success && data.viewUrl) {
        setArchiveLink(data.viewUrl);
        const targetId = saved?.id ?? entryId;
        if (targetId) {
          await fetch('/api/vault/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: targetId, drive: data.viewUrl }),
          }).catch(() => {});
          void refreshEntries();
        }
      } else {
        setArchiveError(data.error || 'Could not write the markdown file.');
      }
    } catch (e: any) {
      setArchiveError(e.message || 'Failed to contact Google Drive.');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <SectionHead
        title="Silent Vault"
        note="Everything is written to this machine first. Google Drive, if you link it, is only a mirror."
        right={
          <div className="flex items-center gap-3">
            {savedAt ? (
              <span className="tag good">
                <i />
                Saved {shortTime(savedAt)}
              </span>
            ) : transcript.trim() ? (
              <span className="tag warn">
                <i />
                Not yet saved
              </span>
            ) : (
              <span className="tag good">
                <i />
                Vault Protected
              </span>
            )}
            <button className="btn btn-sm cut-sm" onClick={newEntry} title="Start a new entry">
              New
            </button>
          </div>
        }
      />

      {recovered && (
        <div className="callout warn mb-6">
          <span className="cd" />
          <span>
            <b>Recovered an unsaved draft.</b> This was still in the browser from last time. It will be written to the
            vault as soon as you touch it, or press Save now.
          </span>
        </div>
      )}

      <div className="grid split split-wide">
        {/* ---- writing column ---- */}
        <div className="flex flex-col gap-6">
          <Frame title="The Vault">
            <div className="inwrap cut-sm">
              <textarea
                className="input"
                style={{ minHeight: '340px', fontFamily: 'var(--body)', fontSize: 'var(--step-0)', lineHeight: 1.75 }}
                value={transcript}
                onChange={e => {
                  setTranscript(e.target.value);
                  setRecovered(false); // they have seen it and taken the entry back over
                }}
                placeholder="Press RECORD to speak, or simply begin writing here…"
              />
            </div>

            <AnimatePresence>
              {aiResponse && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
                  <div className="clabel mb-2">Companion</div>
                  <blockquote className="bq">{aiResponse}</blockquote>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <button
                className={`btn btn-lg cut-sm ${isRecording ? 'btn-crit' : 'btn-primary'}`}
                aria-pressed={isRecording}
                onClick={toggleRecording}
              >
                <span className="flex items-center gap-2">
                  {isRecording ? <StopCircle className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isRecording ? 'Stop' : 'Record'}
                </span>
              </button>
              <span className="keydiv" />
              <button className="btn cut-sm" disabled={!wsReady} onClick={() => companion('speak_trigger_opinion')}>
                Give me your opinion
              </button>
              <button className="btn cut-sm" disabled={!wsReady} onClick={() => companion('speak_trigger_more')}>
                Prompt me for more
              </button>
              {!wsReady && <span className="fhint">Companion offline — reconnecting…</span>}
            </div>
          </Frame>

          <Frame title="Session">
            <div className="grid g3">
              <div className="field">
                <label htmlFor="pick-engine">Transcription engine</label>
                <Picker id="pick-engine" value={engine} onChange={setEngine} groups={engineGroups(providers)} />
              </div>
              <div className="field">
                <label htmlFor="pick-lang">Spoken language</label>
                <Picker id="pick-lang" value={language} onChange={setLanguage} groups={LANGUAGES} />
              </div>
              <div className="field">
                <label htmlFor="pick-style">How to write it down</label>
                <Picker id="pick-style" value={style} onChange={setStyle} groups={STYLES} />
                <span className="fhint">
                  Either way the exact words you spoke are kept in the file. Tidying
                  only changes which version you read first.
                </span>
              </div>
              <div className="field">
                <label>Entry title</label>
                <div className="flex gap-2 items-stretch">
                  <span className="inwrap cut-sm flex-1">
                    <input
                      className="input"
                      value={sessionName}
                      placeholder="Left blank, one is written for you"
                      onChange={e => setSessionName(e.target.value)}
                    />
                  </span>
                  <button className="btn btn-sm cut-sm" disabled={!transcript.trim()} onClick={autoTitle} title="Write a title with Gemini">
                    Auto
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-2">
              <button className="btn cut-sm" disabled={!transcript.trim()} onClick={() => void persist()}>
                <span className="flex items-center gap-2">
                  <Save className="w-3.5 h-3.5" />
                  Save now
                </span>
              </button>
              <span className="keydiv" />
              {google.connected ? (
                <>
                  <button className="btn cut-sm" disabled={isArchiving || !transcript.trim()} onClick={saveToGoogleDocs}>
                    <span className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" />
                      Archive as doc
                    </span>
                  </button>
                  <button className="btn cut-sm" disabled={isArchiving || !transcript.trim()} onClick={saveToDriveMarkdown}>
                    <span className="flex items-center gap-2">
                      <UploadCloud className="w-3.5 h-3.5" />
                      Archive as markdown
                    </span>
                  </button>
                </>
              ) : (
                <button className="btn cut-sm" onClick={onLinkGoogle}>
                  <span className="flex items-center gap-2">
                    <UploadCloud className="w-3.5 h-3.5" />
                    Link Google Drive
                  </span>
                </button>
              )}
              {isArchiving && (
                <span className="flex items-center gap-3 fhint">
                  <span className="spinner" />
                  Writing to your Google account…
                </span>
              )}
            </div>
            <p className="fhint mt-3">
              Entries save themselves to this machine a few seconds after you stop typing. Archiving only adds a copy
              in Drive.
            </p>

            <AnimatePresence>
              {archiveLink && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                  <div className="callout">
                    <span className="cd" />
                    <div className="flex flex-wrap items-center gap-4 w-full">
                      <span className="tag good">
                        <i />
                        Saved
                      </span>
                      <span className="flex-1">This entry now exists in your own Google space.</span>
                      <a className="btn btn-sm cut-sm no-underline" href={archiveLink} target="_blank" rel="noreferrer">
                        <span className="flex items-center gap-2">
                          View <ExternalLink className="w-3 h-3" />
                        </span>
                      </a>
                    </div>
                  </div>
                </motion.div>
              )}
              {archiveError && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                  <div className="callout crit">
                    <span className="cd" />
                    <span>
                      <b>Drive refused the write.</b> {archiveError}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Frame>
        </div>

        {/* ---- vault contents + indicators ---- */}
        <div className="flex flex-col gap-6">
          <Frame
            title="Entries"
            headRight={entries.length > 0 ? <span className="tag"><i />{entries.length}</span> : undefined}
          >
            {entries.length === 0 ? (
              <div className="empty">
                <span className="emptymark cut" />
                <span className="fhint">The vault on this machine is empty.</span>
              </div>
            ) : (
              <div className="flex flex-col max-h-96 overflow-y-auto">
                {entries.map(e => (
                  <div key={e.id} className="listrow">
                    <button
                      className="flex flex-col flex-1 min-w-0 text-left"
                      style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                      onClick={() => void openEntry(e.id)}
                      aria-current={e.id === entryId}
                    >
                      <span
                        className="listname truncate w-full"
                        style={{ color: e.id === entryId ? 'var(--accent-hi)' : undefined }}
                      >
                        {e.title}
                      </span>
                      <span className="listsub">
                        {shortDate(e.created)} · {e.words} words{e.audio ? ' · audio' : ''}
                      </span>
                    </button>
                    {e.drive ? (
                      <span className="tag good"><i />Mirrored</span>
                    ) : (
                      <span className="tag"><i />Local</span>
                    )}
                    <button
                      className="btn btn-sm cut-sm"
                      title="Move to the vault trash — the file stays on disk"
                      onClick={() => void trashEntry(e.id)}
                    >
                      Trash
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Frame>

          {verbatim && (
            <Frame title="Word for word">
              <p className="sec-note" style={{ marginBottom: 'var(--gap)' }}>
                What you actually said, before the fillers were taken out. Kept in
                the file beside the tidied version.
              </p>
              <button className="btn btn-sm cut-sm" onClick={() => setShowVerbatim(v => !v)}>
                {showVerbatim ? 'Hide it' : 'Show it'}
              </button>
              {showVerbatim && (
                <p className="sec-note" style={{ marginTop: 'var(--gap)', whiteSpace: 'pre-wrap' }}>
                  {verbatim}
                </p>
              )}
            </Frame>
          )}

          <Frame title="In English">
            <p className="sec-note" style={{ marginBottom: 'var(--gap)' }}>
              For entries written in Greek. The original is kept exactly as you
              wrote it — this sits beside it, never over it.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button className="btn btn-sm cut-sm" disabled={translating || !transcript.trim()} onClick={translateIt}>
                <span className="flex items-center gap-2">
                  {translating ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                  {translating ? 'Translating…' : english ? 'Translate again' : 'Translate'}
                </span>
              </button>
              {englishBy === 'deepl' && <span className="tag good">DeepL</span>}
              {englishBy === 'gemini-live' && <span className="tag good">Gemini Live — from your voice</span>}
              {englishBy === 'model' && <span className="tag">a language model</span>}
            </div>

            {englishBy === 'model' && (
              <div className="callout warn" style={{ marginTop: 'var(--gap)' }}>
                <span className="cd" />
                <span>
                  No DeepL key is set, so a language model did this. It will have
                  tidied the grammar and smoothed the phrasing — fine for reading
                  back, less so if the exact wording matters. A DeepL key renders
                  rather than rewrites.
                </span>
              </div>
            )}

            {english && (
              <p className="sec-note" style={{ marginTop: 'var(--gap)', whiteSpace: 'pre-wrap' }}>
                {english}
              </p>
            )}
          </Frame>

          <Frame title="When did this happen?">
            <p className="sec-note" style={{ marginBottom: 'var(--gap)' }}>
              Not when you wrote it — when it happened. Your own words are enough;
              a rough range is all the ordering needs.
            </p>

            <Field
              label="In your words"
              value={occurred.text || ''}
              onChange={v => setOccurred(prev => ({ ...prev, text: v }))}
              placeholder="around when we moved"
              hint="Kept exactly as you type it. Never rewritten."
            />

            <div className="grid g2">
              <Field
                label="From"
                value={occurred.start || ''}
                onChange={v => setOccurred(prev => ({ ...prev, start: v }))}
                placeholder="2011"
              />
              <Field
                label="Until"
                value={occurred.end || ''}
                onChange={v => setOccurred(prev => ({ ...prev, end: v }))}
                placeholder="2012"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button className="btn btn-sm cut-sm" disabled={datingBusy || !transcript.trim()} onClick={dateIt}>
                <span className="flex items-center gap-2">
                  {datingBusy ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                  {datingBusy ? 'Reading…' : 'Work it out for me'}
                </span>
              </button>
              {showRange(occurred) && <span className="tag">{showRange(occurred)}</span>}
            </div>

            {occurred.confidence && (
              <p className="fhint" style={{ marginTop: 8 }}>{CONFIDENCE_NOTE[occurred.confidence]}</p>
            )}
          </Frame>

          <Frame title="Indicators" lit>
            <p className="sec-note" style={{ marginBottom: 'var(--gap)' }}>
              Named patterns as they surface in the text. They travel with the entry into the archive.
            </p>
            <div className="flex flex-col gap-4 items-stretch">
              {CATEGORY_ORDER.filter(c => detectedIndicators.some(i => i.category === c)).map(cat => (
                <div key={cat}>
                  <p className="k" style={{ marginBottom: 6 }}>{CATEGORY_LABEL[cat]}</p>
                  <div className="flex flex-col gap-3 items-start">
                    {detectedIndicators
                      .filter(i => i.category === cat)
                      .map(i => (
                        <motion.div
                          key={i.id}
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          style={{ width: '100%' }}
                        >
                          <span className={`tag${cat === 'protection' ? ' good' : ''}`}>{i.label}</span>
                          <p className="fhint" style={{ marginTop: 6 }}>{i.definition}</p>
                          {i.evidence && (
                            <p
                              className="sec-note"
                              style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid var(--rule)' }}
                            >
                              “{i.evidence}”
                            </p>
                          )}
                        </motion.div>
                      ))}
                  </div>
                </div>
              ))}

              {/* Entries written before the vocabulary carried definitions. */}
              {detectedIndicators.length === 0 &&
                detectedTags.map(tag => (
                  <motion.span key={tag} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="tag">
                    {tag}
                  </motion.span>
                ))}

              {detectedTags.length === 0 && detectedIndicators.length === 0 && (
                <div className="empty w-full">
                  <span className="emptymark cut" />
                  <span className="fhint">Nothing named yet.</span>
                </div>
              )}
            </div>
          </Frame>

          <div className="callout warn">
            <span className="cd" />
            <span>
              <b>Microphone.</b> A browser will not grant the microphone inside an embedded preview. Open the app in
              its own tab if RECORD captures nothing.
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* =============================================================================
   SYNTHESIS
   ========================================================================== */

/* =============================================================================
   EPISODES — the book view. Entries grouped by when things happened, each
   group drafted into a chapter whose every claim cites the entry it came from.
   ========================================================================== */

interface ProposedEpisode {
  from: string;
  to: string;
  ids: string[];
  titles: string[];
}
interface EpisodeDraft {
  title: string;
  text: string;
  sources: { id: string; title: string; when: string }[];
  provider: string;
  model: string;
  strippedCitations: string[];
}

function EpisodesPanel() {
  const [episodes, setEpisodes] = useState<ProposedEpisode[] | null>(null);
  const [undated, setUndated] = useState<{ id: string; title: string }[]>([]);
  const [finding, setFinding] = useState(false);
  const [drafting, setDrafting] = useState<number | null>(null);
  const [draft, setDraft] = useState<EpisodeDraft | null>(null);
  const [explain, setExplain] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    setFinding(true);
    setError(null);
    try {
      const d = await (await fetch('/api/episodes/propose')).json();
      if (!d.success) throw new Error(d.error || 'Could not group the entries.');
      setEpisodes(d.episodes);
      setUndated(d.undated || []);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setFinding(false);
    }
  };

  const draftOne = async (i: number) => {
    if (!episodes) return;
    setDrafting(i);
    setError(null);
    setDraft(null);
    try {
      const d = await (
        await fetch('/api/episodes/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: episodes[i].ids, explainTerms: explain }),
        })
      ).json();
      if (!d.success) throw new Error(d.error || 'The draft failed.');
      setDraft(d);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setDrafting(null);
    }
  };

  // Citations arrive as [20260816-142530-a3f]. Shown as the entry's title so a
  // reader can see which of their own entries a sentence rests on.
  const renderWithCitations = (text: string, sources: EpisodeDraft['sources']) => {
    const byId = new Map(sources.map(x => [x.id, x]));
    const parts = text.split(/(\[[0-9]{8}-[0-9]{6}-[a-z0-9]{4}\])/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[([0-9]{8}-[0-9]{6}-[a-z0-9]{4})\]$/);
      if (!m) return <span key={i}>{part}</span>;
      const src = byId.get(m[1]);
      return (
        <sup key={i} className="tag" style={{ fontSize: '0.7em', margin: '0 2px', verticalAlign: 'super' }} title={src?.when || ''}>
          {src?.title || m[1]}
        </sup>
      );
    });
  };

  return (
    <Frame title="Episodes" className="mb-6" lit={!!draft}>
      <p className="sec-note">
        Your entries grouped by <b>when things happened</b>, and each group drafted into
        a chapter. Every sentence is marked with the entry it came from, so nothing in a
        chapter is something you did not write.
      </p>

      <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 'var(--gap)' }}>
        <button className="btn btn-primary cut-sm" disabled={finding} onClick={() => void find()}>
          <span className="flex items-center gap-2">
            {finding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
            {finding ? 'Grouping…' : episodes ? 'Group again' : 'Find my episodes'}
          </span>
        </button>
        <label className="flex items-center gap-2 fhint" style={{ margin: 0, cursor: 'pointer' }}>
          <input type="checkbox" checked={explain} onChange={e => setExplain(e.target.checked)} />
          Explain the named patterns as they come up
        </label>
      </div>

      {error && (
        <div className="callout warn">
          <span className="cd" />
          <span>{error}</span>
        </div>
      )}

      {episodes && episodes.length === 0 && (
        <div className="empty w-full">
          <span className="emptymark cut" />
          <span className="fhint">
            Nothing is placed in time yet. Open an entry and use "When did this happen?" —
            episodes are built from entries that have a when.
          </span>
        </div>
      )}

      {episodes && episodes.length > 0 && (
        <div className="flex flex-col gap-3">
          {episodes.map((ep, i) => (
            <div key={i} className="tile" style={{ padding: '0.8rem 1rem' }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="k" style={{ margin: 0 }}>
                    {ep.from === ep.to || !ep.to ? ep.from : `${ep.from} → ${ep.to}`}
                  </p>
                  <p className="fhint" style={{ margin: '4px 0 0' }}>
                    {ep.titles.join(' · ')}
                  </p>
                </div>
                <button className="btn btn-sm cut-sm" disabled={drafting !== null} onClick={() => void draftOne(i)}>
                  <span className="flex items-center gap-2">
                    {drafting === i ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                    {drafting === i ? 'Drafting…' : `Draft this episode (${ep.ids.length})`}
                  </span>
                </button>
              </div>
            </div>
          ))}
          {undated.length > 0 && (
            <p className="fhint">
              {undated.length} entr{undated.length === 1 ? 'y is' : 'ies are'} not placed in time yet
              and are left out: {undated.map(u => u.title).join(', ')}.
            </p>
          )}
        </div>
      )}

      {draft && (
        <div style={{ marginTop: 'var(--gap)' }}>
          <h3 style={{ margin: '0 0 6px' }}>{draft.title}</h3>
          <p className="fhint" style={{ margin: '0 0 var(--gap)' }}>
            Drafted by {draft.provider} · {draft.model}
            {draft.strippedCitations.length > 0 &&
              ` — ${draft.strippedCitations.length} made-up citation${draft.strippedCitations.length === 1 ? ' was' : 's were'} removed`}
          </p>
          <div className="prose" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {renderWithCitations(draft.text, draft.sources)}
          </div>
          <button
            className="btn btn-sm cut-sm"
            style={{ marginTop: 'var(--gap)' }}
            onClick={() => void navigator.clipboard?.writeText(`${draft.title}\n\n${draft.text}`)}
          >
            Copy the chapter
          </button>
        </div>
      )}
    </Frame>
  );
}

function SynthesisStudio({ google }: { key?: string; google: GoogleStatus }) {
  const [providers] = useProviders();
  const modelGroups: PickerGroup[] = providers.synthesis.map(g => ({
    label: g.local ? `${g.label} — on this machine` : g.label,
    options: g.options,
  }));
  const [model, setModel] = useState('');
  useEffect(() => {
    // Default to the first model the server says it can actually reach.
    if (!model && modelGroups[0]?.options[0]) setModel(modelGroups[0].options[0].value);
  }, [model, modelGroups]);
  const [prompt, setPrompt] = useState(
    'Synthesize these journal entries into a cohesive chapter outline, focusing on identifying patterns of emotional invalidation and resilience.',
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState('');
  const [synthError, setSynthError] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [localEntries, setLocalEntries] = useState<VaultSummary[]>([]);
  const [selectedLocalIds, setSelectedLocalIds] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/vault/entries')
      .then(r => r.json())
      .then(d => {
        if (d.success) setLocalEntries((d.entries || []).filter((e: VaultSummary) => e.words > 0));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!google.connected) return;
    setIsLoadingFiles(true);
    fetch('/api/drive/list-files')
      .then(r => r.json())
      .then(data => {
        if (data.success) setDriveFiles(data.files || []);
      })
      .catch(console.error)
      .finally(() => setIsLoadingFiles(false));
  }, [google.connected]);

  const handleSynthesize = async () => {
    setIsGenerating(true);
    setDraft('');
    setSynthError(null);
    const selectedFiles = driveFiles.filter(f => selectedFileIds.includes(f.id));
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selectedFiles,
          localIds: selectedLocalIds,
          model,
          prompt,
        }),
      });
      const data = await res.json();
      if (data.success) setDraft(data.draft);
      else setSynthError(data.error || 'The model returned nothing.');
    } catch (e: any) {
      setSynthError(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSelectFile = (fileId: string) => {
    setSelectedFileIds(prev => (prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]));
  };

  const toggleSelectLocal = (id: string) => {
    setSelectedLocalIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const totalSelected = selectedFileIds.length + selectedLocalIds.length;
  const nothingSelected = totalSelected === 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <SectionHead title="Synthesis" note="Read the archive back, and let it become chapters." />

      <EpisodesPanel />

      <div className="grid split split-narrow">
        <div className="flex flex-col gap-6">
          <Frame
            title="Sources"
            headRight={totalSelected > 0 ? <span className="tag good"><i />{totalSelected} selected</span> : undefined}
          >
            <div className="clabel mb-2">This machine</div>
            {localEntries.length > 0 ? (
              <div className="flex flex-col gap-1 max-h-72 overflow-y-auto mb-6">
                {localEntries.map(e => (
                  <label key={e.id} className="check py-2">
                    <input
                      type="checkbox"
                      checked={selectedLocalIds.includes(e.id)}
                      onChange={() => toggleSelectLocal(e.id)}
                    />
                    <span className="box" />
                    <span className="txt flex flex-col min-w-0">
                      <span className="truncate">{e.title}</span>
                      <span className="fhint">
                        {shortDate(e.created)} · {e.words} words
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="fhint mb-6">Nothing written yet. Entries appear here as soon as you save one.</p>
            )}

            <div className="clabel mb-2">Google Drive</div>
            {google.connected ? (
              <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
                {isLoadingFiles ? (
                  <div className="flex flex-col gap-3 py-2">
                    <span className="skel" />
                    <span className="skel" style={{ width: '80%' }} />
                    <span className="skel" style={{ width: '60%' }} />
                  </div>
                ) : driveFiles.length > 0 ? (
                  driveFiles.map(file => (
                    <label key={file.id} className="check py-2">
                      <input
                        type="checkbox"
                        checked={selectedFileIds.includes(file.id)}
                        onChange={() => toggleSelectFile(file.id)}
                      />
                      <span className="box" />
                      <span className="txt flex flex-col">
                        <span className="truncate">{file.name}</span>
                        <span className="fhint">
                          {file.mimeType === 'application/vnd.google-apps.document' ? 'Google Doc' : file.mimeType}
                        </span>
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="empty">
                    <span className="emptymark cut" />
                    <span className="fhint">Nothing archived yet. Write in the Vault first.</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="fhint">Not linked. Local entries above are enough to synthesize from.</p>
            )}
          </Frame>

          <Frame title="Directives">
            <div className="field">
              <label htmlFor="pick-model">Model</label>
              <Picker id="pick-model" value={model} onChange={setModel} groups={modelGroups} />
            </div>
            <div className="field">
              <label>Instruction</label>
              <span className="inwrap cut-sm">
                <textarea className="input" style={{ minHeight: '120px' }} value={prompt} onChange={e => setPrompt(e.target.value)} />
              </span>
            </div>
            <button className="btn btn-lg btn-primary cut-sm w-full" disabled={isGenerating || nothingSelected} onClick={handleSynthesize}>
              <span className="flex items-center justify-center gap-2">
                {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isGenerating ? 'Synthesizing…' : 'Synthesize'}
              </span>
            </button>
            {nothingSelected && <p className="fhint mt-3">Select at least one source above.</p>}
            {selectedLocalIds.length > 0 && (
              <p className="fhint mt-3">
                {selectedLocalIds.length} entries leave this machine and are sent to the model you chose.
              </p>
            )}
          </Frame>
        </div>

        <Frame title="Draft" lit>
          {isGenerating && <div className="loader mb-6" />}
          {synthError && (
            <div className="callout crit">
              <span className="cd" />
              <span>
                <b>Synthesis failed.</b> {synthError} Check the key for this provider in Settings.
              </span>
            </div>
          )}
          {draft ? (
            <div className="prose">
              {draft.split(/\n{2,}/).map((para, i) => (
                <p key={i} className={i === 0 ? 'dropcap' : undefined} style={{ whiteSpace: 'pre-wrap' }}>
                  {para}
                </p>
              ))}
            </div>
          ) : (
            !synthError && (
              <div className="empty" style={{ padding: '5rem 1rem' }}>
                <span className="emptymark cut" />
                <span className="fhint">Choose sources, set the instruction, and the chapter is written here.</span>
              </div>
            )
          )}
        </Frame>
      </div>

    </motion.div>
  );
}

/* =============================================================================
   SETTINGS
   ========================================================================== */

interface SettingsCenterProps {
  appearance: { way: string; dress: string };
  onAppearance: (v: { way: string; dress: string }) => void;
  key?: string;
  google: GoogleStatus;
  onLinkGoogle: () => any;
  onDisconnect: () => any;
  onGoogleChanged: () => any;
}

function LockPanel() {
  const [locked, setLocked] = useState<boolean | null>(null);
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  const read = async () => {
    try {
      const data = await (await fetch('/api/auth/status')).json();
      setLocked(Boolean(data.locked));
    } catch (e) {
      setLocked(null);
    }
  };
  useEffect(() => {
    void read();
  }, []);

  const submit = async (value: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/auth/passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next: value }),
      });
      const data = await res.json();
      if (!data.success) {
        setNote({ text: data.error || 'That did not work.', bad: true });
      } else {
        setLocked(Boolean(data.locked));
        setNext('');
        setNote({ text: data.locked ? 'Passcode set. It is stored only as a hash.' : 'Passcode removed.' });
      }
    } catch (e: any) {
      setNote({ text: e.message || 'Could not reach the server.', bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame title="The lock" className="mb-6" lit={locked === false}>
      {locked === false && (
        <div className="callout warn">
          <span className="cd" />
          <span>
            <b>No passcode is set.</b> Anyone who can reach this machine on the network can read every entry. If this
            box is on your home Wi-Fi as well as the tailnet, set one.
          </span>
        </div>
      )}
      {locked === true && (
        <div className="callout">
          <span className="cd" />
          <span className="flex items-center gap-3">
            <span className="tag good">
              <i />
              Locked
            </span>
            A passcode is required to open the vault.
          </span>
        </div>
      )}

      <div className="field">
        <label htmlFor="next-passcode">{locked ? 'New passcode' : 'Set a passcode'}</label>
        <span className="inwrap cut-sm">
          <input
            id="next-passcode"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="At least four characters"
            value={next}
            onChange={e => setNext(e.target.value)}
          />
        </span>
        <span className="fhint">
          Stored as a scrypt hash in .env — it cannot be read back out, so there is no recovery. Write it down.
        </span>
      </div>

      {note && (
        <div className={note.bad ? 'callout crit' : 'callout'}>
          <span className="cd" />
          <span>{note.text}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary cut-sm" disabled={busy || next.length < 4} onClick={() => void submit(next)}>
          {locked ? 'Change passcode' : 'Set passcode'}
        </button>
        {locked && (
          <button className="btn btn-crit cut-sm" disabled={busy} onClick={() => void submit('')}>
            Remove passcode
          </button>
        )}
        {locked && (
          <button
            className="btn cut-sm"
            disabled={busy}
            onClick={async () => {
              await fetch('/api/auth/lock', { method: 'POST' });
              window.location.reload();
            }}
          >
            Lock now
          </button>
        )}
      </div>
    </Frame>
  );
}

const ROUTING_NOTE: Record<string, string> = {
  'cloud-first': 'Cloud providers are asked first, and a local runtime is the fallback.',
  'local-first': 'Your own machine is asked first. The cloud is only reached when it cannot answer.',
  'local-only': 'Nothing leaves this machine. Cloud providers are not asked, and Google Drive is switched off.',
};

function SettingsCenter({
  google,
  onLinkGoogle,
  onDisconnect,
  onGoogleChanged,
  appearance,
  onAppearance,
}: SettingsCenterProps) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [vault, setVault] = useState<{ dir: string; count: number; keepAudio: boolean } | null>(null);
  const [providers, reloadProviders, loadingModels] = useProviders();

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(setConfig);
    fetch('/api/vault/info')
      .then(r => r.json())
      .then(d => {
        if (d.success) setVault(d);
      })
      .catch(() => {});
  }, []);

  const handleChange = (key: string, value: string) => setConfig(prev => ({ ...prev, [key]: value }));

  // Every loaded model, grouped by provider, as picker options.
  const modelOptions: PickerGroup[] = providers.providers
    .filter(p => !p.blocked && p.models.length > 0)
    .map(p => ({
      label: p.local ? `${p.label} — on this machine` : p.label,
      options: p.models.map(m => ({ value: `${p.id}::${m}`, label: m })),
    }));

  // Repair and Update: STANDARDS §6. Both may replace what the installer put
  // on disk; neither goes near the vault, which lives elsewhere by design.
  const [repairReport, setRepairReport] = useState<any>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [updateReport, setUpdateReport] = useState<any>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  const runRepair = async () => {
    setRepairBusy(true);
    try {
      setRepairReport(await (await fetch('/api/maintenance/repair')).json());
    } catch (e: any) {
      setRepairReport({ success: false, error: e?.message || 'Could not reach the app.' });
    } finally {
      setRepairBusy(false);
    }
  };

  const runUpdate = async () => {
    setUpdateBusy(true);
    try {
      setUpdateReport(await (await fetch('/api/maintenance/update')).json());
    } catch (e: any) {
      setUpdateReport({ success: false, error: e?.message || 'Could not reach the app.' });
    } finally {
      setUpdateBusy(false);
    }
  };

  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  /** Assigning a model you cannot actually reach is a failure this app used to
   *  discover halfway through a recording. Save first, then ask for real. */
  const testJob = async (task: string) => {
    setTesting(task);
    setTestResult(prev => ({ ...prev, [task]: '' }));
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const r = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      const d = await r.json();
      setTestResult(prev => ({
        ...prev,
        [task]: d.success
          ? `Answered by ${d.provider} · ${d.model}${d.local ? ' (on this machine)' : ''}.`
          : d.error,
      }));
    } catch (e: any) {
      setTestResult(prev => ({ ...prev, [task]: e?.message || 'Could not reach the app itself.' }));
    } finally {
      setTesting(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setIsSaving(false);
    }

    // Deliberately NOT a deep reload. Saving used to re-ask every configured
    // provider for its whole model list, which on a set-up machine meant seven
    // round trips — one of them a gateway that can take half a minute — before
    // the screen settled. Asking what models exist is what "Load models" is
    // for. This only refreshes the cheap reachability view.
    void reloadProviders(false);
    // The OAuth client id may have just been filled in, which decides whether
    // linking is offered at all.
    void onGoogleChanged();
  };

  const [checking, setChecking] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, { ok: boolean; text: string }>>({});

  /** Save, then ask that one provider what it can reach. Saving first matters:
   *  otherwise the key you just pasted is still only in the browser and the
   *  server would test the old one and tell you it works. */
  const checkProvider = async (id: string) => {
    setChecking(id);
    setChecked(prev => ({ ...prev, [id]: { ok: false, text: 'Checking…' } }));
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const d = await (
        await fetch('/api/providers/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
      ).json();
      setChecked(prev => ({
        ...prev,
        [id]: d.success
          ? { ok: true, text: `Working — ${d.count} model${d.count === 1 ? '' : 's'} available.` }
          : { ok: false, text: d.error },
      }));
      if (d.success) void reloadProviders(providers.loaded);
    } catch (e: any) {
      setChecked(prev => ({ ...prev, [id]: { ok: false, text: e?.message || 'Could not reach the app.' } }));
    } finally {
      setChecking(null);
    }
  };

  // Always a secret, not only once it has come back from the server masked.
  // The old version left a freshly pasted key in plain text on screen.
  //
  // `provider` is the id this key belongs to; giving it one adds a Test button,
  // because pasting a key with no way to tell whether it took is how someone
  // concludes the whole app is broken.
  const keyField = (label: string, key: string, provider?: string) => {
    const result = provider ? checked[provider] : undefined;
    return (
      <div>
        <Field
          label={label}
          value={config[key] || ''}
          onChange={v => handleChange(key, v)}
          secret
          placeholder="Not set"
        />
        {provider && (
          <div className="flex items-center gap-3 flex-wrap" style={{ margin: '-.6rem 0 1rem' }}>
            <button
              className="btn btn-sm cut-sm"
              disabled={checking === provider || !(config[key] || '').trim()}
              onClick={() => void checkProvider(provider)}
            >
              <span className="flex items-center gap-2">
                {checking === provider ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                {checking === provider ? 'Testing…' : 'Test'}
              </span>
            </button>
            {result && (
              <span className={`fhint`} style={{ margin: 0, color: result.ok ? 'var(--good)' : 'var(--ink-2)' }}>
                {result.text}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <SectionHead
        title="Settings"
        note="Keys are written to the .env file beside the app on this machine, and never leave it."
        right={
          <button className="btn btn-primary cut-sm" disabled={isSaving} onClick={handleSave}>
            <span className="flex items-center gap-2">
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Saving…' : 'Save all'}
            </span>
          </button>
        }
      />

      {saved && (
        <div className="callout mb-6">
          <span className="cd" />
          <span className="flex items-center gap-3">
            <span className="tag good">
              <i />
              Written
            </span>
            Configuration saved to .env.
          </span>
        </div>
      )}

      <LockPanel />

      <Frame title="The vault" className="mb-6">
        <p className="sec-note">
          Entries are plain markdown files with front matter. You can read them with anything, back them up with
          <code> cp</code>, and nothing here depends on this app still existing.
        </p>
        <div className="grid g3">
          <div className="tile">
            <p className="k">Location</p>
            <p className="v" style={{ fontSize: 'var(--step-0)', wordBreak: 'break-all' }}>
              {vault ? vault.dir : '—'}
            </p>
          </div>
          <div className="tile">
            <p className="k">Entries</p>
            <p className="v">{vault ? vault.count : '—'}</p>
          </div>
          <div className="tile">
            <p className="k">Recordings kept</p>
            <p className="v" style={{ fontSize: 'var(--step-1)' }}>{vault ? (vault.keepAudio ? 'Yes' : 'No') : '—'}</p>
          </div>
        </div>
        <p className="fhint mt-4">
          Trashed entries move to <code>.trash</code> inside that folder. Nothing in this app deletes anything.
        </p>
      </Frame>

      <Frame title="Where your words go" className="mb-6" lit={config.CLOUD_CONSENT === 'yes'}>
        <p className="sec-note">
          When a cloud provider does a job — transcribing, naming patterns, drafting a
          chapter, translating — what you wrote or said is sent to that company and
          handled under its terms. On free tiers that can include being used to
          improve their products and being read by their reviewers. Local-only routing
          sends nothing anywhere.
        </p>
        <label className="flex items-start gap-3" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.CLOUD_CONSENT === 'yes'}
            onChange={e => handleChange('CLOUD_CONSENT', e.target.checked ? 'yes' : '')}
            style={{ marginTop: 4, width: 18, height: 18 }}
          />
          <span>
            <b>I understand where my words go</b>, and I want cloud providers to be used.
            <span className="fhint" style={{ display: 'block', marginTop: 4 }}>
              Until this is ticked, only models on this machine are asked. Untick it any
              time. Remember to press Save all.
            </span>
          </span>
        </label>
      </Frame>

      <Frame title="Models" className="mb-6" lit={providers.localOnly}>
        <p className="sec-note">
          Any OpenAI-compatible endpoint works, so a model running on this machine and a model running in someone
          else's datacentre are configured the same way. Ollama, LM Studio, llama.cpp and vLLM all speak it, and so do
          the local Whisper servers.
        </p>

        <div style={{ marginBottom: 'var(--gap)' }}>
          <p className="k" style={{ marginBottom: 6 }}>Where models run</p>
          <Picker
            id="pick-routing"
            value={config.MODEL_ROUTING || 'cloud-first'}
            onChange={v => handleChange('MODEL_ROUTING', v)}
            groups={[
              {
                options: [
                  { value: 'cloud-first', label: 'Cloud first' },
                  { value: 'local-first', label: 'Local first' },
                  { value: 'local-only', label: 'Local only' },
                ],
              },
            ]}
          />
          <p className="fhint" style={{ marginTop: 6 }}>
            {ROUTING_NOTE[(config.MODEL_ROUTING || 'cloud-first') as keyof typeof ROUTING_NOTE]}
          </p>
        </div>

        {config.MODEL_ROUTING === 'local-only' && (
          <div className="callout warn">
            <span className="cd" />
            <span>
              Local-only is on. Archiving to Google Drive is refused while it is, and the vault on this disk is the
              only copy — back the folder up yourself.
            </span>
          </div>
        )}

        <div className="grid g2">
          <div>
            <p className="k" style={{ marginBottom: 6 }}>Local models</p>
            <Field
              label="Endpoint"
              value={config.LOCAL_CHAT_BASE_URL || ''}
              onChange={v => handleChange('LOCAL_CHAT_BASE_URL', v)}
              placeholder="http://localhost:11434/v1"
            />
            <Field
              label="Model"
              value={config.LOCAL_CHAT_MODEL || ''}
              onChange={v => handleChange('LOCAL_CHAT_MODEL', v)}
              placeholder="llama3.1:8b"
            />
            <Field
              label="Name it (optional)"
              value={config.LOCAL_CHAT_LABEL || ''}
              onChange={v => handleChange('LOCAL_CHAT_LABEL', v)}
              placeholder="Local"
            />
          </div>

          <div>
            <p className="k" style={{ marginBottom: 6 }}>Local transcription</p>
            <Field
              label="Endpoint"
              value={config.LOCAL_STT_BASE_URL || ''}
              onChange={v => handleChange('LOCAL_STT_BASE_URL', v)}
              placeholder="http://localhost:8000/v1"
            />
            <Field
              label="Model"
              value={config.LOCAL_STT_MODEL || ''}
              onChange={v => handleChange('LOCAL_STT_MODEL', v)}
              placeholder="Systran/faster-whisper-large-v3"
            />
            <p className="fhint">
              Speaches, faster-whisper-server and whisper.cpp all expose an OpenAI-compatible
              <code> /v1/audio/transcriptions</code>.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 'var(--gap)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <p className="k">What answered last time it was asked</p>
            <button className="btn btn-sm cut-sm" onClick={reloadProviders}>
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3 h-3" />
                Recheck
              </span>
            </button>
          </div>

          {providers.providers.length === 0 ? (
            <div className="empty w-full">
              <span className="emptymark cut" />
              <span className="fhint">
                Nothing configured. Add a key below, or point the app at a local runtime above.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {providers.providers.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className={`tag${p.error ? '' : p.reachable === false ? ' bad' : ' good'}`}>
                      <i />
                      {p.label}
                    </span>
                    {p.local && <span className="fhint">on this machine</span>}
                  </span>
                  <span className="fhint" style={{ textAlign: 'right' }}>
                    {p.error
                      ? p.error
                      : p.reachable === false
                        ? 'Not answering'
                        : p.models.length
                          ? `${p.models.length} model${p.models.length === 1 ? '' : 's'} available`
                          : 'Configured'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {providers.providers.some(p => p.local && p.models.length > 0) && (
            <p className="fhint" style={{ marginTop: 8 }}>
              Installed locally:{' '}
              {providers.providers
                .filter(p => p.local)
                .flatMap(p => p.models)
                .slice(0, 12)
                .join(', ')}
            </p>
          )}
        </div>
      </Frame>

      <Frame title="Which model does which job" className="mb-6">
        <p className="sec-note">
          Five jobs, each with a first choice and two fallbacks. If the first
          cannot answer — out of quota, retired, switched off — the second is
          tried, then the third, and the app says which one answered.
        </p>

        <div className="callout">
          <span className="cd" />
          <span className="flex items-center justify-between gap-3 w-full">
            <span>
              {providers.loaded
                ? 'Model lists came from the providers themselves.'
                : 'Model names are never guessed here. Ask each provider what it actually has.'}
            </span>
            <button className="btn btn-primary cut-sm" disabled={loadingModels} onClick={() => void reloadProviders(true)}>
              <span className="flex items-center gap-2">
                {loadingModels ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                {loadingModels ? 'Asking…' : 'Load models'}
              </span>
            </button>
          </span>
        </div>

        {providers.providers.filter(p => p.error && !p.blocked).map(p => (
          <div key={p.id} className="callout warn">
            <span className="cd" />
            <span>
              <b>{p.label}.</b> {p.error}
            </span>
          </div>
        ))}

        {modelOptions.length === 0 ? (
          <div className="empty w-full">
            <span className="emptymark cut" />
            <span className="fhint">
              No models to assign yet. Add a key below, or a local endpoint above, then press Load models.
            </span>
          </div>
        ) : (
          providers.tasks.map(job => (
            <div key={job.id} style={{ marginBottom: 'var(--gap)' }}>
              <div className="flex items-center justify-between gap-3" style={{ marginBottom: 4 }}>
                <p className="k">{job.label}</p>
                {job.id !== 'transcribe' && (
                  <button className="btn btn-sm cut-sm" onClick={() => void testJob(job.id)} disabled={testing === job.id}>
                    <span className="flex items-center gap-2">
                      {testing === job.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                      {testing === job.id ? 'Trying…' : 'Try it'}
                    </span>
                  </button>
                )}
              </div>
              <p className="fhint" style={{ marginBottom: 8 }}>{job.blurb}</p>

              <div className="grid g3">
                {[1, 2, 3].map(n => (
                  <div key={n}>
                    <p className="flabel">{n === 1 ? 'First choice' : `Fallback ${n - 1}`}</p>
                    <Picker
                      id={`pick-${job.id}-${n}`}
                      value={config[`MODEL_${job.id.toUpperCase()}_${n}`] || ''}
                      onChange={v => handleChange(`MODEL_${job.id.toUpperCase()}_${n}`, v)}
                      groups={[{ options: [{ value: '', label: '— none —' }] }, ...modelOptions]}
                    />
                  </div>
                ))}
              </div>

              {testResult[job.id] && (
                <p className="fhint" style={{ marginTop: 6 }}>
                  {testResult[job.id]}
                </p>
              )}
            </div>
          ))
        )}

        <p className="fhint">
          Leave a job entirely blank and the app picks for itself, trying whatever
          is configured. Assigning it is how you stop it choosing something you
          did not want to pay for.
        </p>
      </Frame>

      <div className="grid g2">
        <Frame title="Provider keys">
          {keyField('Google Gemini', 'GEMINI_API_KEY', 'gemini')}
          {keyField('Groq', 'GROQ_API_KEY', 'groq')}
          {keyField('Mistral', 'MISTRAL_API_KEY', 'mistral')}
          {keyField('NVIDIA NIM', 'NVIDIA_API_KEY', 'nvidia')}
          {keyField('Cerebras', 'CEREBRAS_API_KEY', 'cerebras')}
          <p className="k" style={{ margin: 'var(--gap) 0 6px' }}>DeepL</p>
          <p className="fhint" style={{ marginBottom: 8 }}>
            For Greek entries. A translator rather than a language model, so it
            renders what you said instead of rewriting it — which is the whole
            point when the text is testimony. Optional.
          </p>
          {keyField('DeepL', 'DEEPL_API_KEY')}

          <p className="k" style={{ margin: 'var(--gap) 0 6px' }}>OmniRoute</p>
          <p className="fhint" style={{ marginBottom: 8 }}>
            A gateway you run yourself, fronting many providers at once. Leave the
            endpoint blank for <code>http://localhost:20128/v1</code>, or point it at
            the machine running it.
          </p>
          <Field
            label="Endpoint"
            value={config.OMNIROUTE_BASE_URL || ''}
            onChange={v => handleChange('OMNIROUTE_BASE_URL', v)}
            placeholder="http://localhost:20128/v1"
          />
          {keyField('Its key', 'OMNIROUTE_API_KEY', 'omniroute')}
          <div className="callout warn">
            <span className="cd" />
            <span>
              OmniRoute runs on your hardware but forwards to cloud providers, so it
              counts as cloud here and is switched off under local-only routing. Its
              transcription endpoint returns English — if you record in Greek and
              want the Greek kept, give transcription a Whisper model instead.
            </span>
          </div>

          <p className="k" style={{ margin: 'var(--gap) 0 6px' }}>OpenRouter</p>
          {keyField('OpenRouter', 'OPENROUTER_API_KEY', 'openrouter')}
          <p className="fhint">
            OpenRouter fronts hundreds of models behind one key, which makes it the
            cheapest way to try a model this app has never heard of.
          </p>

          <p className="k" style={{ margin: 'var(--gap) 0 6px' }}>Any other OpenAI-compatible endpoint</p>
          <p className="fhint" style={{ marginBottom: 8 }}>
            A gateway, a company proxy, or a service that appeared after this
            shipped. If it speaks the OpenAI shape, it works here with no code
            change — only a URL.
          </p>
          <Field
            label="Endpoint"
            value={config.CUSTOM_BASE_URL || ''}
            onChange={v => handleChange('CUSTOM_BASE_URL', v)}
            placeholder="https://example.com/v1"
          />
          <Field
            label="Name it"
            value={config.CUSTOM_LABEL || ''}
            onChange={v => handleChange('CUSTOM_LABEL', v)}
            placeholder="Custom endpoint"
          />
          {keyField('Its key', 'CUSTOM_API_KEY', 'custom')}
        </Frame>

        <Frame title="Google account" lit={google.connected && !providers.localOnly}>
          <p className="sec-note">
            Archiving writes into your own Drive and Docs. The link is held by this server as a refresh token, so it
            does not expire after an hour the way the old sign-in did.
          </p>

          {google.connected ? (
            <>
              <div className="callout">
                <span className="cd" />
                <span className="flex items-center gap-3">
                  <span className="tag good">
                    <i />
                    Linked
                  </span>
                  {google.email}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="btn btn-crit cut-sm" onClick={onDisconnect}>
                  Unlink
                </button>
                <a
                  className="btn btn-sm cut-sm no-underline"
                  href="https://drive.google.com/drive/my-drive"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="flex items-center gap-2">
                    Open Drive <ExternalLink className="w-3 h-3" />
                  </span>
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="fhint mb-4">
                Create an OAuth client (type: Web application) in the Google Cloud console, add this app's
                <code> /auth/callback </code> as an authorised redirect URI, and paste the two values below. Google
                only accepts https origins or localhost, so on a headless box link the account once from a browser on
                that machine.
              </p>
              <Field
                label="OAuth client ID"
                value={config.GOOGLE_CLIENT_ID || ''}
                onChange={v => handleChange('GOOGLE_CLIENT_ID', v)}
                placeholder="Not set"
              />
              <Field
                label="OAuth client secret"
                value={config.GOOGLE_CLIENT_SECRET || ''}
                onChange={v => handleChange('GOOGLE_CLIENT_SECRET', v)}
                secret
                placeholder="Not set"
              />
              {!google.configured && (
                <div className="callout warn">
                  <span className="cd" />
                  <span>Save the client ID and secret before linking.</span>
                </div>
              )}
              <button className="btn btn-primary cut-sm" disabled={!google.configured} onClick={onLinkGoogle}>
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Link Google account
                </span>
              </button>
            </>
          )}
        </Frame>
      </div>

      <Frame title="Advanced" className="mb-6">
        <p className="sec-note">
          Checking and mending the app itself. Neither of these touches your
          writing: the vault and your settings live in a separate folder, so
          repairing or updating the program cannot reach them.
        </p>

        <div className="grid g2">
          <div>
            <p className="k" style={{ marginBottom: 6 }}>Repair</p>
            <p className="fhint" style={{ marginBottom: 8 }}>
              Checks that the app's own files are all present and not empty.
            </p>
            <button className="btn btn-sm cut-sm" disabled={repairBusy} onClick={() => void runRepair()}>
              <span className="flex items-center gap-2">
                {repairBusy ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                {repairBusy ? 'Checking…' : 'Check my files'}
              </span>
            </button>

            {repairReport && (
              <div style={{ marginTop: 'var(--gap)' }}>
                {repairReport.healthy ? (
                  <span className="tag good">
                    <i />
                    Everything is where it should be
                  </span>
                ) : (
                  <>
                    <span className="tag bad">
                      <i />
                      {repairReport.missing?.length} missing
                    </span>
                    <p className="fhint" style={{ marginTop: 8 }}>{repairReport.advice || repairReport.error}</p>
                    {repairReport.missing?.length > 0 && (
                      <ul className="fhint" style={{ marginTop: 6 }}>
                        {repairReport.missing.map((m: string) => (
                          <li key={m}>
                            <code>{m}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="k" style={{ marginBottom: 6 }}>Update</p>
            <p className="fhint" style={{ marginBottom: 8 }}>
              Asks GitHub whether a newer version has been released.
            </p>
            <button className="btn btn-sm cut-sm" disabled={updateBusy} onClick={() => void runUpdate()}>
              <span className="flex items-center gap-2">
                {updateBusy ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                {updateBusy ? 'Asking…' : 'Check for an update'}
              </span>
            </button>

            {updateReport && (
              <div style={{ marginTop: 'var(--gap)' }}>
                {updateReport.error ? (
                  <p className="fhint">{updateReport.error}</p>
                ) : updateReport.behind ? (
                  <>
                    <span className="tag">
                      {updateReport.current} → {updateReport.latest}
                    </span>
                    <p className="fhint" style={{ marginTop: 8 }}>
                      A newer version is available. Installing it replaces the program
                      and leaves your writing alone.
                    </p>
                    <a
                      className="btn btn-sm cut-sm no-underline"
                      href={updateReport.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ marginTop: 8, display: 'inline-block' }}
                    >
                      <span className="flex items-center gap-2">
                        Open the release <ExternalLink className="w-3 h-3" />
                      </span>
                    </a>
                  </>
                ) : (
                  <span className="tag good">
                    <i />
                    Up to date ({updateReport.current})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </Frame>

      <Frame title="How it looks" className="mb-6">
        <p className="sec-note">
          Kept on this device, not in the vault. The same journal reached from a
          phone at night and a desktop in daylight is allowed to look different.
        </p>

        <div className="grid g2">
          <div>
            <p className="k" style={{ marginBottom: 6 }}>Colourway</p>
            <Picker
              id="pick-way"
              value={appearance.way}
              onChange={v => onAppearance({ ...appearance, way: v })}
              groups={[{ options: WAYS.map(w => ({ value: w.id, label: w.label })) }]}
            />
            <p className="fhint" style={{ marginTop: 6 }}>
              {WAYS.find(w => w.id === appearance.way)?.note}
            </p>
          </div>

          <div>
            <p className="k" style={{ marginBottom: 6 }}>Ornament</p>
            <Picker
              id="pick-dress"
              value={appearance.dress}
              onChange={v => onAppearance({ ...appearance, dress: v })}
              groups={[{ options: DRESSES.map(d => ({ value: d.id, label: d.label })) }]}
            />
            <p className="fhint" style={{ marginTop: 6 }}>
              {DRESSES.find(d => d.id === appearance.dress)?.note}
            </p>
          </div>
        </div>

        <p className="fhint">
          If your system asks for reduced motion, this app already obeys it — nothing
          here animates regardless of the setting above.
        </p>
      </Frame>

      <Frame title="Check and repair" className="mb-6">
        <p className="sec-note">
          What is actually configured, and whether it answers. A setting you can get
          wrong needs somewhere to see that it is wrong.
        </p>

        <div className="grid g3">
          <div className="tile">
            <p className="k">Where models run</p>
            <p className="v" style={{ fontSize: 'var(--step-0)' }}>{providers.routing}</p>
          </div>
          <div className="tile">
            <p className="k">Providers reachable</p>
            <p className="v">
              {providers.providers.filter(p => !p.blocked && !p.error).length}/
              {providers.providers.filter(p => !p.blocked).length}
            </p>
          </div>
          <div className="tile">
            <p className="k">Jobs with a model</p>
            <p className="v">
              {Object.values(providers.assignments).filter(v => v.length > 0).length}/{providers.tasks.length}
            </p>
          </div>
        </div>

        {providers.tasks.filter(t => (providers.assignments[t.id] || []).length === 0).length > 0 && (
          <div className="callout warn" style={{ marginTop: 'var(--gap)' }}>
            <span className="cd" />
            <span>
              No model is assigned for:{' '}
              <b>
                {providers.tasks
                  .filter(t => (providers.assignments[t.id] || []).length === 0)
                  .map(t => t.label)
                  .join(', ')}
              </b>
              . Those jobs will pick for themselves from whatever is configured, which
              works but is not what you chose.
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 'var(--gap)' }}>
          <button className="btn btn-sm cut-sm" disabled={loadingModels} onClick={() => void reloadProviders(true)}>
            <span className="flex items-center gap-2">
              {loadingModels ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loadingModels ? 'Checking…' : 'Re-check everything'}
            </span>
          </button>
          <span className="fhint" style={{ margin: 0 }}>
            Asks every provider what it can reach. Costs nothing.
          </span>
        </div>
      </Frame>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 20,
          marginTop: 'var(--gap)',
          padding: '.75rem 0 calc(.75rem + env(safe-area-inset-bottom))',
          background:
            'linear-gradient(to top, var(--ground) 62%, color-mix(in srgb, var(--ground) 80%, transparent))',
          borderTop: 'var(--hair) solid rgb(var(--accent-rgb) / .24)',
        }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="fhint" style={{ margin: 0 }}>
            {saved ? 'Saved to .env on this machine.' : 'Changes are not kept until you save.'}
          </span>
          <button className="btn btn-primary cut-sm" disabled={isSaving} onClick={handleSave}>
            <span className="flex items-center gap-2">
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Saving…' : 'Save all'}
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
