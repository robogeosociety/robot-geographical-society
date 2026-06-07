import { describe, test, expect, afterEach } from 'vitest';
import { apiBase } from './apiBase';

const orig = { ...import.meta.env };
afterEach(() => {
  import.meta.env.DEV = orig.DEV;
  // import.meta.env stringifies assigned values ("undefined" !== undefined), so
  // restore an absent var by deleting it rather than assigning.
  if (orig.VITE_BACKEND_URL === undefined) delete import.meta.env.VITE_BACKEND_URL;
  else import.meta.env.VITE_BACKEND_URL = orig.VITE_BACKEND_URL;
});

describe('apiBase', () => {
  test('dev → same-origin /api proxy (token applied server-side), even if a URL is set', () => {
    import.meta.env.DEV = true;
    import.meta.env.VITE_BACKEND_URL = 'https://example.workers.dev';
    expect(apiBase()).toBe('/api');
  });

  test('prod → the deployed backend origin, trailing slash trimmed', () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_BACKEND_URL = 'https://example.workers.dev/';
    expect(apiBase()).toBe('https://example.workers.dev');
  });

  test('prod with no backend url → same-origin /api fallback', () => {
    import.meta.env.DEV = false;
    delete import.meta.env.VITE_BACKEND_URL; // a genuinely unset var is `undefined`, not "undefined"
    expect(apiBase()).toBe('/api');
  });
});
