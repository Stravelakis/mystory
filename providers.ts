/* =============================================================================
   PROVIDERS — where the models actually live.

   Every model this app talks to is reached one of two ways:

     - an OpenAI-compatible /v1 endpoint. Groq, Mistral, Cerebras, NVIDIA and
       OpenRouter speak it. So do Ollama, LM Studio, the llama.cpp server, vLLM
       and LocalAI, and so do the local Whisper servers (Speaches,
       faster-whisper-server, whisper.cpp). A machine under your desk and a
       machine in Virginia are the same shape of thing.
     - Google's own SDK, which is its own shape and always will be.

   So there is no "local mode" hidden in a branch somewhere. A local runtime is
   just a provider whose base URL happens to be on your own network and whose
   `local` flag is true. Routing decides which providers may be asked and in
   what order, and local-only makes that a guarantee rather than a preference.

   STANDARDS #10 — do not guess at model names.
   Nothing in this file is the authority on what a model is called. The
   built-in ids are *suggestions used only when the user has not chosen*, and
   every one of them is one provider rename away from being a 404. `listModels`
   asks the endpoint what it actually has, and the Settings screen puts that
   behind a "Load models" button. What the user picks always wins.
   ========================================================================== */

import { GoogleGenAI } from '@google/genai';

export type Routing = 'cloud-first' | 'local-first' | 'local-only';

/** Every job a model is asked to do. Each one can be assigned a first choice
 *  and two fallbacks, per task, in Settings. */
export type Task = 'indicators' | 'companion' | 'title' | 'synthesis' | 'transcribe';

export const TASKS: { id: Task; label: string; blurb: string }[] = [
  {
    id: 'transcribe',
    label: 'Transcription',
    blurb: 'Turns a recording into text. The one job where quality is felt immediately.',
  },
  {
    id: 'indicators',
    label: 'Indicators',
    blurb: 'Names patterns in an entry and quotes the words it drew them from. Runs while you type, so it wants to be fast and cheap.',
  },
  {
    id: 'companion',
    label: 'Companion',
    blurb: 'The grounded response or gentle prompt, when you ask for one. Never runs unasked.',
  },
  { id: 'title', label: 'Titles', blurb: 'Names an entry in a few words. The smallest job here.' },
  {
    id: 'synthesis',
    label: 'Synthesis',
    blurb: 'Drafts entries into chapters. The one job worth a slow, expensive model.',
  },
];

export interface Provider {
  id: string;
  label: string;
  kind: 'openai' | 'gemini';
  local: boolean;
  /** OpenAI-compatible root, including /v1. Empty for the Gemini SDK. */
  baseUrl: string;
  apiKey: string;
  /** Suggestions, per task. Only consulted when the user has chosen nothing. */
  chat: Partial<Record<Task, string[]>>;
  stt: string[];
  /** Whether asking this endpoint for its model list costs nothing. */
  canList: boolean;
  /** Where transcription lives, in order of preference. OpenAI's own shape has
   *  both /audio/transcriptions (verbatim, same language) and
   *  /audio/translations (always English), and gateways do not all implement
   *  both. Defaults to transcriptions only. */
  sttPaths?: string[];
  /** Reachable on your own network, but forwards requests to cloud providers.
   *  Not the same thing as local, and deliberately not treated as local. */
  proxies?: boolean;
}

export interface ChatRequest {
  task: Task;
  prompt: string;
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
  /** Synthesis pins the exact model the user chose for this one run. */
  model?: string;
  providerId?: string;
}

export const ROUTINGS: Routing[] = ['cloud-first', 'local-first', 'local-only'];

export function readRouting(config: Record<string, string>): Routing {
  const v = (config.MODEL_ROUTING || '').trim() as Routing;
  return ROUTINGS.includes(v) ? v : 'cloud-first';
}

/** True when the app must not call anything but the local endpoints. Google
 *  Drive is switched off by the same flag — mirroring a journal into someone
 *  else's datacentre is exactly the thing being refused here. */
export function isLocalOnly(config: Record<string, string>): boolean {
  return readRouting(config) === 'local-only';
}

/** Base URLs are normalised to end in /v1, because everyone writes them
 *  differently and none of them are wrong. */
function normaliseBase(raw: string): string {
  let url = (raw || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (!/\/v\d+$/.test(url)) url = `${url}/v1`;
  return url;
}

/* -----------------------------------------------------------------------------
   The registry
   -------------------------------------------------------------------------- */

export function resolveProviders(config: Record<string, string>): Provider[] {
  const list: Provider[] = [];

  /* --- Local ------------------------------------------------------------- */

  const localChat = normaliseBase(config.LOCAL_CHAT_BASE_URL);
  if (localChat) {
    const model = (config.LOCAL_CHAT_MODEL || '').trim();
    const models = model ? [model] : [];
    list.push({
      id: 'local',
      label: config.LOCAL_CHAT_LABEL?.trim() || 'Local',
      kind: 'openai',
      local: true,
      baseUrl: localChat,
      // Ollama and llama.cpp ignore the key; LM Studio and vLLM may want one.
      apiKey: (config.LOCAL_CHAT_API_KEY || '').trim() || 'local',
      chat: { indicators: models, companion: models, title: models, synthesis: models },
      stt: [],
      canList: true,
    });
  }

  const localStt = normaliseBase(config.LOCAL_STT_BASE_URL);
  if (localStt) {
    list.push({
      id: 'local-stt',
      label: 'Local Whisper',
      kind: 'openai',
      local: true,
      baseUrl: localStt,
      apiKey: (config.LOCAL_STT_API_KEY || '').trim() || 'local',
      chat: {},
      stt: [(config.LOCAL_STT_MODEL || '').trim() || 'Systran/faster-whisper-large-v3'],
      canList: true,
    });
  }

  /* --- Aggregators ------------------------------------------------------- */

  // OpenRouter fronts hundreds of models behind one key and one OpenAI-shaped
  // endpoint, so there is nothing to special-case: the model list comes from
  // its own /models, which is free to call.
  if (config.OPENROUTER_API_KEY) {
    list.push({
      id: 'openrouter',
      label: 'OpenRouter',
      kind: 'openai',
      local: false,
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: config.OPENROUTER_API_KEY,
      // Deliberately no defaults. OpenRouter is here as an option, not as a
      // route anybody's journal takes without being told to: it is only ever
      // used for a job it has been explicitly assigned to in Settings.
      // Its /models listed 424 models on 3 Sep 2026, 43 of them Google's.
      chat: {},
      stt: [],
      canList: true,
    });
  }

  // OmniRoute — a self-hosted gateway fronting many providers behind one
  // OpenAI-shaped endpoint. https://github.com/diegosouzapw/OmniRoute
  //
  // Confirmed against a live instance on 3 Sep 2026:
  //   · /v1/models and /v1/chat/completions are OpenAI-shaped, so the ordinary
  //     driver works unchanged
  //   · it can require auth even when self-hosted (AUTH_002 on an anonymous
  //     GET), and its CORS advertises Authorization and x-api-key — so a
  //     bearer token is the right thing to send
  //   · transcription is at /v1/audio/translations, NOT /audio/transcriptions
  //   · the model "auto" is a routing instruction rather than a model name, so
  //     it cannot go stale the way a real id can
  //
  // NOT marked local. It runs on hardware you own, but it forwards to cloud
  // providers, so treating it as local would quietly break the promise that
  // local-only makes. Under local-only it is blocked like any other cloud path.
  const omniBase = normaliseBase(config.OMNIROUTE_BASE_URL);
  if (omniBase || config.OMNIROUTE_API_KEY) {
    list.push({
      id: 'omniroute',
      label: 'OmniRoute',
      kind: 'openai',
      local: false,
      proxies: true,
      baseUrl: omniBase || 'http://localhost:20128/v1',
      apiKey: (config.OMNIROUTE_API_KEY || '').trim() || 'none',
      chat: {
        indicators: ['auto'],
        companion: ['auto'],
        title: ['auto'],
        synthesis: ['auto'],
      },
      stt: ['auto'],
      // Verbatim first. The translations endpoint always returns English, so it
      // is a last resort and says so when it is used.
      sttPaths: ['/audio/transcriptions', '/audio/translations'],
      canList: true,
    });
  }

  // Anything else that speaks the OpenAI shape. This is the escape hatch for a
  // gateway we have not heard of, a company proxy, or a service that appears
  // after this ships — no code change, just a URL.
  const customBase = normaliseBase(config.CUSTOM_BASE_URL);
  if (customBase) {
    list.push({
      id: 'custom',
      label: config.CUSTOM_LABEL?.trim() || 'Custom endpoint',
      kind: 'openai',
      local: false,
      baseUrl: customBase,
      apiKey: (config.CUSTOM_API_KEY || '').trim() || 'none',
      chat: {},
      stt: [],
      canList: true,
    });
  }

  /* --- Cloud ------------------------------------------------------------- */

  if (config.GROQ_API_KEY) {
    list.push({
      id: 'groq',
      label: 'Groq',
      kind: 'openai',
      local: false,
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: config.GROQ_API_KEY,
      chat: {
        indicators: ['llama-3.1-8b-instant'],
        companion: ['llama-3.3-70b-versatile'],
        title: ['llama-3.1-8b-instant'],
        synthesis: ['llama-3.3-70b-versatile'],
      },
      stt: ['whisper-large-v3', 'whisper-large-v3-turbo'],
      canList: true,
    });
  }

  if (config.MISTRAL_API_KEY) {
    list.push({
      id: 'mistral',
      label: 'Mistral',
      kind: 'openai',
      local: false,
      baseUrl: 'https://api.mistral.ai/v1',
      apiKey: config.MISTRAL_API_KEY,
      chat: {
        indicators: ['mistral-small-latest'],
        companion: ['mistral-large-latest'],
        title: ['mistral-small-latest'],
        synthesis: ['mistral-large-latest'],
      },
      stt: [],
      canList: true,
    });
  }

  if (config.CEREBRAS_API_KEY) {
    list.push({
      id: 'cerebras',
      label: 'Cerebras',
      kind: 'openai',
      local: false,
      baseUrl: 'https://api.cerebras.ai/v1',
      apiKey: config.CEREBRAS_API_KEY,
      chat: {},
      stt: [],
      canList: true,
    });
  }

  if (config.NVIDIA_API_KEY) {
    list.push({
      id: 'nvidia',
      label: 'NVIDIA NIM',
      kind: 'openai',
      local: false,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: config.NVIDIA_API_KEY,
      chat: {},
      stt: [],
      canList: true,
    });
  }

  const geminiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (geminiKey) {
    list.push({
      id: 'gemini',
      label: 'Google Gemini',
      kind: 'gemini',
      local: false,
      baseUrl: '',
      apiKey: geminiKey,
      // Deliberately empty. Google renames and retires these faster than this
      // app ships, and a wrong default here is the user's 404. Press "Load
      // models" in Settings and pick from what the account actually has.
      chat: {},
      stt: [],
      canList: true,
    });
  }

  return list;
}

/** The providers that may be asked, in the order they should be asked. */
export function chainFor(
  config: Record<string, string>,
  providers = resolveProviders(config),
): Provider[] {
  const routing = readRouting(config);
  if (routing === 'local-only') return providers.filter(p => p.local);
  const local = providers.filter(p => p.local);
  const cloud = providers.filter(p => !p.local);
  return routing === 'local-first' ? [...local, ...cloud] : [...cloud, ...local];
}

/* -----------------------------------------------------------------------------
   Assignments — a first choice and two fallbacks, per task.

   Stored as MODEL_<TASK>_1 / _2 / _3, each "<providerId>::<model>". An empty
   slot is skipped. When a task has no assignment at all, the automatic chain
   above is used instead, so a fresh install still works with nothing set.
   -------------------------------------------------------------------------- */

export interface Slot {
  providerId: string;
  model: string;
}

export function slotKeys(task: Task): string[] {
  const t = task.toUpperCase();
  return [`MODEL_${t}_1`, `MODEL_${t}_2`, `MODEL_${t}_3`];
}

export const ASSIGNMENT_KEYS: string[] = TASKS.flatMap(t => slotKeys(t.id));

export function slotsFor(config: Record<string, string>, task: Task): Slot[] {
  const out: Slot[] = [];
  for (const key of slotKeys(task)) {
    const raw = (config[key] || '').trim();
    if (!raw) continue;
    const [providerId, ...rest] = raw.split('::');
    const model = rest.join('::').trim();
    if (providerId && model) out.push({ providerId, model });
  }
  return out;
}

/* -----------------------------------------------------------------------------
   Errors, in plain English.

   STANDARDS #1 and #2. Google in particular returns codes that mean something
   other than what they say, and repeating the raw code sends people to fix the
   wrong thing. Recorded on a live account in the Image Forge project, Sep 2026.
   -------------------------------------------------------------------------- */

export function explain(status: number, body: string, provider: string): string {
  const b = (body || '').toLowerCase();
  const google = provider === 'gemini';

  if (status === 429) {
    if (google) {
      // Google uses 429 for BOTH "slow down" and "this project has no money",
      // and the second one never resolves by waiting.
      return b.includes('quota') || b.includes('billing') || b.includes('exhausted')
        ? 'Google refused this as out of quota. On a free-tier key that means today’s allowance is gone and it resets tomorrow. If the project is linked to Cloud billing, it means the paid quota needs credit — waiting will not fix that one.'
        : 'Google is asking for a slower rate. Try again in a moment.';
    }
    return 'The provider is rate-limiting this key. Try again in a moment, or use a fallback model.';
  }

  // Verified against the live endpoint, 3 Sep 2026: an invalid Gemini key
  // comes back 400 INVALID_ARGUMENT, not 401 or 403. Checking 403 alone left
  // the user reading a raw JSON blob for the commonest mistake there is.
  if (status === 400 && google && (b.includes('api key') || b.includes('api_key'))) {
    return 'Google rejected the key itself. Check it was copied whole, and that it is an AI Studio key (aistudio.google.com/apikey) rather than a Cloud console credential.';
  }

  if (status === 403) {
    if (google) {
      // 403 covers a bad key AND a project-level block. Different fixes.
      return b.includes('api key') || b.includes('api_key') || b.includes('invalid')
        ? 'Google rejected the key itself. Check it was copied whole, and that it is an AI Studio key rather than a Cloud console credential.'
        : 'Google accepted the key but refused the project behind it. Usually the Generative Language API is not enabled on that project, or the project is restricted. A fresh key from AI Studio is the quickest way past it.';
    }
    return 'The provider refused this key. It may be wrong, revoked, or not entitled to this model.';
  }

  if (status === 404) {
    return `${provider} has no model by that name. Providers rename and retire models constantly — press “Load models” in Settings and pick from what the account actually has.`;
  }
  if (status === 401) return 'The provider did not accept this key at all. Check it in Settings.';
  if (status === 400 && b.includes('safety'))
    return 'The model refused to answer on safety grounds. A different model will usually take it.';
  if (status >= 500) return `${provider} is having trouble at their end. This is not your key.`;

  return `${provider} returned ${status}. ${(body || '').slice(0, 200)}`;
}

/* -----------------------------------------------------------------------------
   Drivers
   -------------------------------------------------------------------------- */

const TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 120_000);

/** OpenRouter asks callers to identify themselves, and uses it for the public
 *  model-usage rankings. Sending a project name rather than a user's own
 *  hostname keeps a private journal out of anybody's referrer log. */
function authHeaders(p: Provider): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${p.apiKey}` };
  if (p.id === 'openrouter') {
    h['HTTP-Referer'] = 'https://github.com/Stravelakis/mystory';
    h['X-Title'] = 'My Story';
  }
  // OmniRoute accepts either; sending both costs nothing and saves a support
  // question about which one it wanted.
  if (p.id === 'omniroute') h['x-api-key'] = p.apiKey;
  return h;
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function openaiChat(p: Provider, model: string, req: ChatRequest): Promise<string> {
  const body: any = {
    model,
    messages: [{ role: 'user', content: req.prompt }],
    temperature: req.temperature ?? 0.2,
  };
  if (req.maxTokens) body.max_tokens = req.maxTokens;
  // Not every runtime implements JSON mode. Asked for, never depended on:
  // the callers all parse defensively.
  if (req.json) body.response_format = { type: 'json_object' };

  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { ...authHeaders(p), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new ProviderError(explain(res.status, await res.text(), p.label), res.status);

  const data: any = await res.json();
  if (data?.error) throw new ProviderError(data.error.message || 'Refused.', 0);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new ProviderError('The model returned nothing.', 0);
  return text;
}

async function geminiChat(p: Provider, model: string, req: ChatRequest): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: p.apiKey });
  const config: any = { temperature: req.temperature ?? 0.2 };
  // Gemma models on this endpoint reject responseMimeType.
  if (req.json && !model.startsWith('gemma')) config.responseMimeType = 'application/json';
  try {
    const response = await ai.models.generateContent({ model, contents: req.prompt, config });
    const text = response?.text;
    if (!text) throw new ProviderError('The model returned nothing.', 0);
    return text;
  } catch (err: any) {
    const status = Number(err?.status || err?.code || 0);
    throw new ProviderError(
      status ? explain(status, String(err?.message || ''), 'gemini') : String(err?.message || err),
      status,
    );
  }
}

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
  local: boolean;
}

/** Walks the assignments for this task, then the automatic chain, and returns
 *  the first answer. Every failure is recorded and stepped over. */
export async function chat(config: Record<string, string>, req: ChatRequest): Promise<ChatResult> {
  const providers = resolveProviders(config);
  const allowed = chainFor(config, providers);
  const byId = new Map(allowed.map(p => [p.id, p]));

  // What to try, in order.
  const attempts: { p: Provider; model: string }[] = [];

  if (req.model) {
    // A model pinned for this single run — the Synthesis picker.
    const p = req.providerId ? byId.get(req.providerId) : allowed[0];
    if (p) attempts.push({ p, model: req.model });
  } else {
    for (const slot of slotsFor(config, req.task)) {
      const p = byId.get(slot.providerId);
      if (p) attempts.push({ p, model: slot.model });
    }
    if (attempts.length === 0) {
      // Nothing assigned: fall back to the automatic chain.
      for (const p of allowed) {
        for (const model of p.chat[req.task] || []) attempts.push({ p, model });
      }
    }
  }

  if (attempts.length === 0) {
    throw new Error(
      isLocalOnly(config)
        ? 'Local-only routing is on, but no local model is set up for this job. Settings → Models.'
        : 'No model is set up for this job yet. Add a key in Settings → Models, press “Load models”, and assign one.',
    );
  }

  const failures: string[] = [];
  for (const { p, model } of attempts) {
    try {
      const text = p.kind === 'gemini' ? await geminiChat(p, model, req) : await openaiChat(p, model, req);
      console.info(`[${req.task}] ${p.id}/${model}`);
      return { text, provider: p.id, model, local: p.local };
    } catch (err: any) {
      const why = err?.message || String(err);
      failures.push(`${p.label} (${model}): ${why}`);
      console.warn(`[${req.task}] ${p.id}/${model} failed — ${why}`);
    }
  }
  // The first failure is the one the user chose first, so it is the one worth
  // leading with.
  throw new Error(failures[0] + (failures.length > 1 ? ` — and ${failures.length - 1} fallback(s) also failed.` : ''));
}

/* -----------------------------------------------------------------------------
   Transcription
   -------------------------------------------------------------------------- */

export const LANGUAGE_NAMES: Record<string, string> = { el: 'Greek', en: 'English' };

async function openaiTranscribe(
  p: Provider,
  model: string,
  buffer: Buffer,
  mimetype: string,
  language: string,
  spoken: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], { type: mimetype || 'audio/webm' }),
    'recording.webm',
  );
  form.append('model', model);
  if (language) form.append('language', language);
  form.append(
    'prompt',
    `This is a personal memory narrative journal recording. ${spoken} Please transcribe it accurately.`,
  );

  // Most providers only have /audio/transcriptions. Gateways sometimes only
  // have /audio/translations, which is not the same thing — it always returns
  // English. Verbatim is tried first, always.
  const paths = p.sttPaths?.length ? p.sttPaths : ['/audio/transcriptions'];
  let last: ProviderError | null = null;

  for (const path of paths) {
    const res = await fetch(`${p.baseUrl}${path}`, {
      method: 'POST',
      headers: authHeaders(p),
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) {
      const data: any = await res.json();
      const text = typeof data === 'string' ? data : data?.text;
      if (!text) throw new ProviderError('The transcript came back empty.', 0);
      if (path.endsWith('/audio/translations')) {
        // Worth saying out loud: the entry is now in English regardless of what
        // was spoken, which for a journal kept in Greek is a real change to
        // the record rather than a formatting detail.
        console.warn(
          `[transcribe] ${p.label} has no /audio/transcriptions, so /audio/translations was used — this transcript is in ENGLISH, not the language spoken.`,
        );
      }
      return String(text).trim();
    }

    last = new ProviderError(explain(res.status, await res.text(), p.label), res.status);
    // Only a missing endpoint is worth trying the next path for. A 401 or a
    // 429 will say the same thing at both.
    if (res.status !== 404 && res.status !== 405) throw last;
  }
  throw last || new ProviderError('No transcription endpoint answered.', 0);
}

async function geminiTranscribe(
  p: Provider,
  model: string,
  buffer: Buffer,
  mimetype: string,
  spoken: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: p.apiKey });
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        { inlineData: { mimeType: mimetype || 'audio/webm', data: buffer.toString('base64') } },
        `Transcribe this speech accurately in its original language. ${spoken} Return only the transcript text. Do not add any preamble, conversational commentary, formatting, or notes. Return only the transcript.`,
      ],
    });
    const text = response?.text;
    if (!text) throw new ProviderError('The transcript came back empty.', 0);
    return text.trim();
  } catch (err: any) {
    const status = Number(err?.status || err?.code || 0);
    throw new ProviderError(
      status ? explain(status, String(err?.message || ''), 'gemini') : String(err?.message || err),
      status,
    );
  }
}

export interface TranscribeResult {
  text: string;
  provider: string;
  model: string;
  local: boolean;
}

export async function transcribe(
  config: Record<string, string>,
  buffer: Buffer,
  mimetype: string,
  opts: { engine?: string; language?: string } = {},
): Promise<TranscribeResult> {
  const language = opts.language && LANGUAGE_NAMES[opts.language] ? opts.language : '';
  const spoken = language
    ? `The recording is in ${LANGUAGE_NAMES[language]}.`
    : 'The recording is in English or Greek, or a mix of both.';

  const providers = resolveProviders(config);
  const allowed = chainFor(config, providers);
  const byId = new Map(allowed.map(p => [p.id, p]));

  const attempts: { p: Provider; model: string }[] = [];
  for (const slot of slotsFor(config, 'transcribe')) {
    const p = byId.get(slot.providerId);
    if (p) attempts.push({ p, model: slot.model });
  }
  if (attempts.length === 0) {
    for (const p of allowed) for (const model of p.stt) attempts.push({ p, model });
  }

  // The Vault can pin one engine for the session rather than leaving it on Auto.
  const picked =
    opts.engine && opts.engine !== 'auto' ? attempts.filter(a => a.p.id === opts.engine) : attempts;

  if (picked.length === 0) {
    throw new Error(
      isLocalOnly(config)
        ? 'Local-only routing is on, but no local Whisper endpoint is set up. Settings → Models.'
        : 'No transcription model is set up yet. Add a Groq or Gemini key, or a local Whisper server, under Settings → Models.',
    );
  }

  const failures: string[] = [];
  for (const { p, model } of picked) {
    try {
      const text =
        p.kind === 'gemini'
          ? await geminiTranscribe(p, model, buffer, mimetype, spoken)
          : await openaiTranscribe(p, model, buffer, mimetype, language, spoken);
      console.info(`[transcribe] ${p.id}/${model}`);
      return { text, provider: p.id, model, local: p.local };
    } catch (err: any) {
      const why = err?.message || String(err);
      failures.push(`${p.label} (${model}): ${why}`);
      console.warn(`[transcribe] ${p.id}/${model} failed — ${why}`);
    }
  }
  // The recording is already on disk. Say so, because it is the thing the
  // person actually cares about at this moment.
  throw new Error(`${failures[0]} Your recording is safe in the vault — try again, or pick another engine.`);
}

/* -----------------------------------------------------------------------------
   Discovery — STANDARDS #10.

   Ask the endpoint what it has. Every one of these is a plain GET that costs
   nothing, which is why it can be offered as a button rather than buried in a
   release note.
   -------------------------------------------------------------------------- */

/** Google is not OpenAI-shaped, so its listing is its own call. This is the
 *  single most useful request in the app for a Gemini user: it returns exactly
 *  the models that key is entitled to, on that tier, today. */
async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(explain(res.status, await res.text(), 'gemini'));
  const data: any = await res.json();
  return (data?.models || [])
    .filter((m: any) => (m?.supportedGenerationMethods || []).includes('generateContent'))
    .map((m: any) => String(m?.name || '').replace(/^models\//, ''))
    .filter(Boolean)
    .sort();
}

export async function listModels(p: Provider): Promise<string[]> {
  if (p.kind === 'gemini') return listGeminiModels(p.apiKey);
  if (!p.baseUrl) return [];
  const res = await fetch(`${p.baseUrl}/models`, {
    headers: authHeaders(p),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(explain(res.status, await res.text(), p.label));
  const data: any = await res.json();
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return rows
    .map((m: any) => m?.id)
    .filter((id: any) => typeof id === 'string')
    .sort();
}

export interface ProbeResult {
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

/** `deep` asks every provider for its model list. That is what the "Load
 *  models" button does; the cheap version only checks the endpoints the user
 *  typed in, so opening Settings does not fire off a dozen requests. */
export async function probe(config: Record<string, string>, deep = false): Promise<ProbeResult[]> {
  const providers = resolveProviders(config);
  const allowed = new Set(chainFor(config, providers).map(p => p.id));

  return Promise.all(
    providers.map(async p => {
      const base: ProbeResult = {
        id: p.id,
        label: p.label,
        local: p.local,
        kind: p.kind,
        baseUrl: p.baseUrl,
        reachable: null,
        models: [],
      };
      if (!allowed.has(p.id)) {
        return { ...base, blocked: true, error: 'Not asked, because routing is set to local only.' };
      }
      if (!deep && !p.local) return base;
      if (!p.canList) return base;
      try {
        return { ...base, reachable: true, models: await listModels(p) };
      } catch (err: any) {
        return { ...base, reachable: false, error: String(err?.message || err) };
      }
    }),
  );
}

/** Everything the Settings screen needs to offer a model for a slot, and the
 *  Synthesis screen to offer one for a run. */
export async function catalogue(config: Record<string, string>, deep = false) {
  const probed = await probe(config, deep);
  return probed
    .filter(p => !p.blocked)
    .map(p => ({
      id: p.id,
      label: p.label,
      local: p.local,
      models: p.models,
      error: p.error,
    }));
}

/** Models a user may pick for one Synthesis run. Prefers whatever has been
 *  assigned to synthesis, then anything else that has been loaded. */
export function synthesisChoices(config: Record<string, string>) {
  const assigned = slotsFor(config, 'synthesis');
  const providers = new Map(chainFor(config).map(p => [p.id, p]));
  const groups: { label: string; local: boolean; options: { value: string; label: string }[] }[] = [];

  if (assigned.length) {
    groups.push({
      label: 'Assigned to synthesis',
      local: assigned.every(s => providers.get(s.providerId)?.local ?? false),
      options: assigned
        .filter(s => providers.has(s.providerId))
        .map(s => ({
          value: `${s.providerId}::${s.model}`,
          label: `${providers.get(s.providerId)!.label} · ${s.model}`,
        })),
    });
  }

  for (const p of providers.values()) {
    const models = p.chat.synthesis || [];
    if (!models.length) continue;
    groups.push({
      label: p.label,
      local: p.local,
      options: models.map(m => ({ value: `${p.id}::${m}`, label: m })),
    });
  }
  return groups;
}
