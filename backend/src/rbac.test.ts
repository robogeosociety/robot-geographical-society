import { expect, test, describe } from 'vitest';
import { app } from './index';
import { identify, roleFor } from './auth';
import { makeR2 } from '../test/stubs/r2';

const ADMIN = 'tommy.b.doerr@gmail.com';

// Fake Access JWT (header.payload.sig) — only the payload is decoded.
function jwt(claims: Record<string, unknown>): string {
  const b64url = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `h.${b64url}.s`;
}
const hdr = (claims: Record<string, unknown>) => ({ 'Cf-Access-Jwt-Assertion': jwt(claims) });

function makeKV(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get: async (k: string) => (m.has(k) ? m.get(k)! : null),
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({
      keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
    }),
    _map: m,
  };
}
const env = (over: Record<string, unknown> = {}) =>
  ({ CAMPSITES: makeKV(), RAW: makeR2({}), BOOTSTRAP_ADMIN: ADMIN, ...over }) as any;

describe('identify — Access JWT → identity', () => {
  test('email login', () => {
    expect(identify(new Request('http://x', { headers: hdr({ email: 'A@B.com' }) })))
      .toEqual({ email: 'a@b.com', serviceToken: null });
  });
  test('service token (common_name, no email)', () => {
    expect(identify(new Request('http://x', { headers: hdr({ common_name: 'rgs-local-dev' }) })))
      .toEqual({ email: null, serviceToken: 'rgs-local-dev' });
  });
  test('no Access header → anonymous', () => {
    expect(identify(new Request('http://x'))).toEqual({ email: null, serviceToken: null });
  });
});

describe('roleFor — identity → role', () => {
  test('service token → admin (owner dev token)', async () => {
    expect(await roleFor(env(), { email: null, serviceToken: 'rgs-local-dev' })).toBe('admin');
  });
  test('bootstrap email → admin', async () => {
    expect(await roleFor(env(), { email: ADMIN, serviceToken: null })).toBe('admin');
  });
  test('email with a role:<email>=admin KV entry → admin', async () => {
    const e = env({ CAMPSITES: makeKV({ 'role:bob@x.com': 'admin' }) });
    expect(await roleFor(e, { email: 'bob@x.com', serviceToken: null })).toBe('admin');
  });
  test('unknown authenticated email → viewer', async () => {
    expect(await roleFor(env(), { email: 'rando@x.com', serviceToken: null })).toBe('viewer');
  });
  test('anonymous → viewer', async () => {
    expect(await roleFor(env(), { email: null, serviceToken: null })).toBe('viewer');
  });
});

describe('/me', () => {
  test('reports admin for the bootstrap email', async () => {
    const res = await app.request('/me', { headers: hdr({ email: ADMIN }) }, env());
    expect(await res.json()).toMatchObject({ email: ADMIN, role: 'admin', isAdmin: true });
  });
  test('reports viewer for an unknown email', async () => {
    const res = await app.request('/me', { headers: hdr({ email: 'rando@x.com' }) }, env());
    expect(await res.json()).toMatchObject({ role: 'viewer', isAdmin: false });
  });
});

describe('mutation guard (adminOnly)', () => {
  test('viewer → 403 on /collect/reactivate', async () => {
    const res = await app.request('/collect/reactivate?id=234501', { method: 'POST', headers: hdr({ email: 'rando@x.com' }) }, env());
    expect(res.status).toBe(403);
  });
  test('admin (bootstrap) → 200', async () => {
    const res = await app.request('/collect/reactivate?id=234501', { method: 'POST', headers: hdr({ email: ADMIN }) }, env());
    expect(res.status).toBe(200);
  });
  test('service token → 200 (owner dev path)', async () => {
    const res = await app.request('/collect/reactivate?id=234501', { method: 'POST', headers: hdr({ common_name: 'rgs-local-dev' }) }, env());
    expect(res.status).toBe(200);
  });
});

describe('/admin/elevate', () => {
  test('viewer cannot elevate (403)', async () => {
    const res = await app.request('/admin/elevate?email=bob@x.com', { method: 'POST', headers: hdr({ email: 'rando@x.com' }) }, env());
    expect(res.status).toBe(403);
  });
  test('admin elevates another email → that email becomes admin', async () => {
    const e = env();
    const res = await app.request('/admin/elevate?email=Bob@X.com', { method: 'POST', headers: hdr({ email: ADMIN }) }, e);
    expect(res.status).toBe(200);
    expect(await roleFor(e, { email: 'bob@x.com', serviceToken: null })).toBe('admin');
  });
});
