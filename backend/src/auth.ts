import type { Context, Next } from 'hono';

// App auth after the tailnet migration (Phase 2): the Worker IS the wall.
// Cloudflare Access was retired — there is no edge identity in front anymore.
// A single pre-shared key (wrangler secret RGS_KEY, canonical copy on the mini
// at ~/.config/rgs/wall-key, distributed by rgs-vend) admits the owner's
// machines: the tailnet web proxy, obsidian-automations vault_sync, rgs-admin.
// Everything else gets a blank 404 from the wall middleware in index.ts before
// any route runs. Role model: key = admin — every request that survives the
// wall is one of the owner's machines. (The old Access-JWT path is gone on
// purpose: without Access at the edge, Cf-Access-Jwt-Assertion is forgeable.)
//
// Local dev: `wrangler dev` without the RGS_KEY secret leaves the wall open and
// every caller is admin — the same trust model as the old local-dev proxy.

export type Role = 'admin' | 'viewer';

type AuthEnv = { RGS_KEY?: string };

export const ROLE_PREFIX = 'role:'; // legacy KV role entries (kept only for /admin/users listing)

export const WALL_HEADER = 'X-RGS-Key';

/** Constant-time comparison of the presented key against the secret. */
export async function keyOk(env: AuthEnv, req: Request): Promise<boolean> {
  const secret = env.RGS_KEY;
  const presented = req.headers.get(WALL_HEADER);
  if (!secret || !presented || presented.length !== secret.length) return false;
  const enc = new TextEncoder();
  const a = enc.encode(presented);
  const b = enc.encode(secret);
  if (a.byteLength !== b.byteLength) return false;
  // Workers-specific constant-time equality when available.
  const subtle = crypto.subtle as unknown as { timingSafeEqual?: (x: ArrayBuffer, y: ArrayBuffer) => boolean };
  if (subtle.timingSafeEqual) return subtle.timingSafeEqual(a.buffer as ArrayBuffer, b.buffer as ArrayBuffer);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function roleFor(env: AuthEnv, req: Request): Promise<Role> {
  if (!env.RGS_KEY) return 'admin'; // local dev: no wall configured
  return (await keyOk(env, req)) ? 'admin' : 'viewer';
}

export async function whoami(env: AuthEnv, req: Request) {
  const role = await roleFor(env, req);
  return {
    email: null as string | null,
    serviceToken: role === 'admin' ? 'rgs-key' : null,
    role,
    isAdmin: role === 'admin',
  };
}

// Hono middleware: 403 unless the caller is an admin. Post-wall this is mostly
// redundant (the wall only admits key bearers, who are admin) but stays as
// defense-in-depth and for local-dev semantics.
export function adminOnly() {
  return async (c: Context, next: Next) => {
    const role = await roleFor(c.env, c.req.raw);
    if (role !== 'admin') return c.json({ error: 'admin role required' }, 403);
    await next();
  };
}
