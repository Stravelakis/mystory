// The routing promises in the README, checked without calling any model: every
// case here must fail or filter before a request is made.
import { describe, it, expect } from 'vitest';
import { chat, chainFor, resolveProviders, slotsFor, hasCloudConsent, NO_CONSENT_MESSAGE } from '../providers.ts';

const cloudOnly = { GEMINI_API_KEY: 'test-key-not-real', GROQ_API_KEY: 'test-key-not-real' };
const withLocal = { ...cloudOnly, LOCAL_CHAT_BASE_URL: 'http://127.0.0.1:9/v1', LOCAL_CHAT_MODEL: 'tiny' };

describe('cloud consent', () => {
  it('is off unless it says exactly yes', () => {
    expect(hasCloudConsent({})).toBe(false);
    expect(hasCloudConsent({ CLOUD_CONSENT: 'true' })).toBe(false);
    expect(hasCloudConsent({ CLOUD_CONSENT: 'yes' })).toBe(true);
  });

  it('refuses before any request when only cloud providers are configured', async () => {
    await expect(chat(cloudOnly, { task: 'title', prompt: 'x' })).rejects.toThrow(NO_CONSENT_MESSAGE);
  });
});

describe('routing', () => {
  it('local-only never lists a cloud provider, even with keys set', () => {
    const chain = chainFor({ ...withLocal, MODEL_ROUTING: 'local-only' });
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every(p => p.local)).toBe(true);
  });

  it('local-first puts local providers ahead of cloud ones', () => {
    const chain = chainFor({ ...withLocal, MODEL_ROUTING: 'local-first' });
    const firstCloud = chain.findIndex(p => !p.local);
    const lastLocal = chain.map(p => p.local).lastIndexOf(true);
    expect(lastLocal).toBeLessThan(firstCloud);
  });

  it('a provider without a key is not offered at all', () => {
    const ids = resolveProviders(cloudOnly).map(p => p.id);
    expect(ids).toContain('gemini');
    expect(ids).not.toContain('mistral');
  });
});

describe('slots', () => {
  it('reads first choice and fallbacks in order, skipping blanks and junk', () => {
    const slots = slotsFor(
      {
        MODEL_WHEN_1: 'gemini::gemini-3.5-flash-lite',
        MODEL_WHEN_2: '',
        MODEL_WHEN_3: 'openrouter::vendor/model::with-colons',
      },
      'when',
    );
    expect(slots).toEqual([
      { providerId: 'gemini', model: 'gemini-3.5-flash-lite' },
      { providerId: 'openrouter', model: 'vendor/model::with-colons' },
    ]);
    expect(slotsFor({ MODEL_WHEN_1: 'no-separator' }, 'when')).toEqual([]);
  });
});
