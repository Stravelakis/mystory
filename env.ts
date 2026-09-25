/* =============================================================================
   CONFIG — the .env file beside the app.

   Two rules hold this together:
     - Only CONFIG_KEYS may be read or written by the browser. The server
       answers to anyone who can reach the port, so the rest of the environment
       is none of its business.
     - Writing the file NEVER serialises process.env. Read the file, merge, write
       the file.
   ========================================================================== */

import fs from 'fs/promises';
import path from 'path';

// The desktop build keeps settings in the user's own data folder rather than
// beside the program, so an installer can replace every file it shipped
// without going near a key or a passcode. MYSTORY_ENV_PATH is set by the
// Electron shell; running from source it is unset and this stays where it was.
export const ENV_PATH = process.env.MYSTORY_ENV_PATH || path.join(process.cwd(), '.env');

/** Settable from the settings screen. */
export const CONFIG_KEYS = [
  'GEMINI_API_KEY',
  'NVIDIA_API_KEY',
  'MISTRAL_API_KEY',
  'GROQ_API_KEY',
  'CEREBRAS_API_KEY',
  // Where models run. A local runtime is configured, not compiled in: any
  // OpenAI-compatible endpoint works — Ollama, LM Studio, llama.cpp, vLLM —
  // and MODEL_ROUTING decides whether the cloud may be asked at all.
  'MODEL_ROUTING',
  'CLOUD_CONSENT',
  'TRANSCRIBE_STYLE',
  'LIVE_TRANSLATE_MODEL',
  'LOCAL_CHAT_BASE_URL',
  'LOCAL_CHAT_MODEL',
  'LOCAL_CHAT_API_KEY',
  'LOCAL_CHAT_LABEL',
  'LOCAL_STT_BASE_URL',
  'LOCAL_STT_MODEL',
  'LOCAL_STT_API_KEY',
  'OPENROUTER_API_KEY',
  'DEEPL_API_KEY',
  'OMNIROUTE_BASE_URL',
  'OMNIROUTE_API_KEY',
  'CUSTOM_BASE_URL',
  'CUSTOM_API_KEY',
  'CUSTOM_LABEL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  // A first choice and two fallbacks for each job, each "<providerId>::<model>".
  // Listed explicitly rather than generated, because CONFIG_KEYS is the
  // allow-list that decides what the browser may write to .env at all.
  'MODEL_TRANSCRIBE_1', 'MODEL_TRANSCRIBE_2', 'MODEL_TRANSCRIBE_3',
  'MODEL_INDICATORS_1', 'MODEL_INDICATORS_2', 'MODEL_INDICATORS_3',
  'MODEL_COMPANION_1', 'MODEL_COMPANION_2', 'MODEL_COMPANION_3',
  'MODEL_WHEN_1', 'MODEL_WHEN_2', 'MODEL_WHEN_3',
  'MODEL_TITLE_1', 'MODEL_TITLE_2', 'MODEL_TITLE_3',
  'MODEL_SYNTHESIS_1', 'MODEL_SYNTHESIS_2', 'MODEL_SYNTHESIS_3',
] as const;

/** Masked on the way out. The client sends the mask back untouched and the
 *  server keeps the stored value, so a secret can be set but never read back. */
export const SECRET_KEYS = new Set<string>([
  'GEMINI_API_KEY',
  'NVIDIA_API_KEY',
  'MISTRAL_API_KEY',
  'GROQ_API_KEY',
  'CEREBRAS_API_KEY',
  'LOCAL_CHAT_API_KEY',
  'LOCAL_STT_API_KEY',
  'OPENROUTER_API_KEY',
  'DEEPL_API_KEY',
  'OMNIROUTE_API_KEY',
  'CUSTOM_API_KEY',
  'GOOGLE_CLIENT_SECRET',
]);

/** Owned by the server, never exposed through /api/config. */
export const PASSCODE_KEY = 'APP_PASSCODE_HASH';
export const SECRET_KEY = 'SESSION_SECRET';
export const GOOGLE_REFRESH_KEY = 'GOOGLE_REFRESH_TOKEN';
export const GOOGLE_EMAIL_KEY = 'GOOGLE_ACCOUNT_EMAIL';

export async function readEnvFile(): Promise<Record<string, string>> {
  const config: Record<string, string> = {};
  try {
    const data = await fs.readFile(ENV_PATH, 'utf-8');
    data.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        config[key] = val;
      }
    });
  } catch (e) {
    // No file yet is a normal state, not an error.
  }
  return config;
}

async function writeEnvFile(merged: Record<string, string>): Promise<void> {
  let content = '';
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === 'string') content += `${key}="${value.replace(/"/g, '\\"')}"\n`;
  }
  await fs.writeFile(ENV_PATH, content, { mode: 0o600 });
}

/** The file, with the real environment layered on top. For internal use by the
 *  model routers — never serialise the result back to disk. */
export async function loadConfig(): Promise<Record<string, string>> {
  const merged = { ...(await readEnvFile()) };
  for (const [key, value] of Object.entries(process.env)) {
    if (value) merged[key] = value;
  }
  return merged;
}

/** Writes the file AND updates process.env for the same keys.
 *
 *  Both halves are required, and it is not obvious why. `dotenv.config()` runs
 *  at boot and copies .env into process.env; `loadConfig()` then layers
 *  process.env *over* the file, so that a real environment variable can
 *  override a stored one. Writing only the file therefore left every setting
 *  that existed at boot permanently unchangeable from the Settings screen —
 *  you saved a key, the file changed, and loadConfig went on returning the
 *  stale boot value until the next restart.
 *
 *  Found on 3 Sep 2026 while a model assignment refused to change: the app
 *  reported running gemma-4-31b when the request had asked for
 *  gemini-3.8-flash. The failure mode is worse than it sounds, because a user
 *  pasting a corrected API key sees nothing happen and concludes the key is
 *  wrong. */
export async function saveConfig(newConfig: any): Promise<void> {
  const merged = await readEnvFile();
  for (const key of CONFIG_KEYS) {
    if (typeof newConfig[key] === 'string') {
      merged[key] = newConfig[key];
      // An empty value means "unset", and an empty string in process.env is
      // falsy to loadConfig anyway — delete it so the file is the only source.
      if (newConfig[key] === '') delete process.env[key];
      else process.env[key] = newConfig[key];
    }
  }
  await writeEnvFile(merged);
}

/** For values the server owns: the passcode hash, the session secret, the
 *  Google refresh token. */
export async function setEnvKey(key: string, value: string | null): Promise<void> {
  const merged = await readEnvFile();
  if (value === null) delete merged[key];
  else merged[key] = value;
  await writeEnvFile(merged);
  if (value === null) delete process.env[key];
  else process.env[key] = value;
}
