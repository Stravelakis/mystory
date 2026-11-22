import { describe, it, expect, vi, afterEach } from 'vitest';
import { translate } from '../translate.ts';

afterEach(() => vi.unstubAllGlobals());

describe('translate under local-only routing', () => {
  it('never calls DeepL, even with a key and cloud consent', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      translate({ MODEL_ROUTING: 'local-only', CLOUD_CONSENT: 'yes', DEEPL_API_KEY: 'k:fx' }, 'γεια'),
    ).rejects.toThrow();
    const urls = fetchMock.mock.calls.map(c => String((c as unknown[])[0]));
    expect(urls.some(u => u.includes('deepl.com'))).toBe(false);
  });
});
