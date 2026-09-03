/* =============================================================================
   GOOGLE — server-side OAuth with a refresh token.

   The old arrangement used Firebase's sign-in popup, which hands the browser an
   access token that lives about an hour and cannot be renewed. Archiving then
   failed silently until you signed in again.

   Here the server holds a refresh token and mints access tokens as needed. The
   browser never sees a Google credential at all, which also means a token
   cannot leak through the client, and linking survives restarts indefinitely.
   ========================================================================== */

import crypto from 'crypto';
import { loadConfig, setEnvKey, GOOGLE_REFRESH_KEY, GOOGLE_EMAIL_KEY } from './env.ts';

export const GOOGLE_SCOPES = [
  // drive.file is deliberately narrow: it grants access only to files this app
  // creates, not to everything in the Drive.
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export class NotConnected extends Error {
  constructor(message = 'No Google account is linked.') {
    super(message);
    this.name = 'NotConnected';
  }
}

/* ---- access token cache -------------------------------------------------
   In memory only. It is derived from the refresh token, so there is nothing to
   persist and nothing lost on restart. */

let cached: { token: string; expires: number } | null = null;

/** Short-lived one-time states for the consent round trip. */
const pendingStates = new Map<string, number>();

export function newState(): string {
  const state = crypto.randomBytes(16).toString('base64url');
  pendingStates.set(state, Date.now() + 10 * 60_000);
  // Opportunistic sweep — this map should never hold more than a handful.
  for (const [key, exp] of pendingStates) if (exp < Date.now()) pendingStates.delete(key);
  return state;
}

export function consumeState(state: unknown): boolean {
  if (typeof state !== 'string' || !pendingStates.has(state)) return false;
  const exp = pendingStates.get(state)!;
  pendingStates.delete(state);
  return exp > Date.now();
}

async function clientCredentials() {
  const config = await loadConfig();
  const id = config.GOOGLE_CLIENT_ID;
  const secret = config.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new NotConnected('Add a Google OAuth client ID and secret in Settings first.');
  }
  return { id, secret };
}

/** Google's token endpoint, with the network failure separated from the OAuth
 *  failure. "fetch failed" tells you nothing about which of the two happened. */
async function postToken(body: URLSearchParams): Promise<any> {
  let res: Response;
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e: any) {
    throw new Error(`Could not reach Google (${e?.cause?.code || e.message}). The link is intact — try again.`);
  }
  return res.json();
}

export function authUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    include_granted_scopes: 'true',
    // Without this, a second linking returns no refresh token and the whole
    // point of the exercise is lost.
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ email: string }> {
  const { id, secret } = await clientCredentials();

  const tokens = await postToken(
    new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
  );
  if (tokens.error) throw new Error(tokens.error_description || tokens.error);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google returned no refresh token. Remove this app at myaccount.google.com/permissions and link again.'
    );
  }

  cached = { token: tokens.access_token, expires: Date.now() + (tokens.expires_in || 3600) * 1000 - 60_000 };

  let email = 'Google account';
  try {
    const info: any = await (
      await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
    ).json();
    if (info.email) email = info.email;
  } catch (e) {
    // A missing display name is not worth failing the link over.
  }

  await setEnvKey(GOOGLE_REFRESH_KEY, tokens.refresh_token);
  await setEnvKey(GOOGLE_EMAIL_KEY, email);
  return { email };
}

/** A valid access token, refreshed on demand. Every Drive and Docs call goes
 *  through here rather than trusting anything sent by the browser. */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.token;

  const config = await loadConfig();
  const refresh = config[GOOGLE_REFRESH_KEY];
  if (!refresh) throw new NotConnected();

  const { id, secret } = await clientCredentials();
  const tokens = await postToken(
    new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    })
  );

  if (tokens.error) {
    // invalid_grant means the refresh token is dead for good — revoked, or the
    // password changed. Clear it so the UI can say "link again" rather than
    // retrying forever.
    if (tokens.error === 'invalid_grant') {
      await setEnvKey(GOOGLE_REFRESH_KEY, null);
      await setEnvKey(GOOGLE_EMAIL_KEY, null);
      cached = null;
      throw new NotConnected('Google revoked the link. Connect the account again.');
    }
    throw new Error(tokens.error_description || tokens.error);
  }

  cached = { token: tokens.access_token, expires: Date.now() + (tokens.expires_in || 3600) * 1000 - 60_000 };
  return cached.token;
}

export async function status(): Promise<{ connected: boolean; email: string; configured: boolean }> {
  const config = await loadConfig();
  return {
    connected: Boolean(config[GOOGLE_REFRESH_KEY]),
    email: config[GOOGLE_EMAIL_KEY] || '',
    configured: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
  };
}

export async function disconnect(): Promise<void> {
  const config = await loadConfig();
  const refresh = config[GOOGLE_REFRESH_KEY];
  if (refresh) {
    // Best effort: tell Google to forget it too, so the grant does not linger
    // in the account's permissions list.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, {
      method: 'POST',
    }).catch(() => {});
  }
  await setEnvKey(GOOGLE_REFRESH_KEY, null);
  await setEnvKey(GOOGLE_EMAIL_KEY, null);
  cached = null;
}
