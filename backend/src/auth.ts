import type { Context, Next } from 'hono';

// App-level RBAC over Cloudflare Access. Every request that reaches the Worker has
// already passed Access (public hostnames are gated; the only other path — the Pages
// Function service binding — runs behind the Access-gated Pages app), and Access
// stamps a verified identity in the `Cf-Access-Jwt-Assertion` header. We read the
// email from it and map it to a role:
//   - the vended service token (local dev proxy / Tailscale) → admin (it's the owner's)
//   - the BOOTSTRAP_ADMIN email → admin (deterministic first admin)
//   - an email with a `role:<email>` = "admin" KV entry → admin
//   - anyone else authenticated → viewer
// Reads are open to any authenticated user; mutations require admin (see adminOnly).

export type Role = 'admin' | 'viewer';
export type Identity = { email: string | null; serviceToken: string | null };

type AuthEnv = { CAMPSITES: KVNamespace; BOOTSTRAP_ADMIN?: string };

export const ROLE_PREFIX = 'role:';

// Decode (not verify) the Access JWT payload — Access already verified the signature at
// the edge before the request reached us. Verifying against the team JWKS is a
// defense-in-depth follow-up.
function decodeJwtPayload(token: string): any | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function identify(req: Request): Identity {
  const jwt = req.headers.get('Cf-Access-Jwt-Assertion');
  const claims = jwt ? decodeJwtPayload(jwt) : null;
  const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : null;
  // Service-token (non_identity) logins carry `common_name` and no email.
  const serviceToken = !email && typeof claims?.common_name === 'string' ? claims.common_name : null;
  return { email, serviceToken };
}

export async function roleFor(env: AuthEnv, id: Identity): Promise<Role> {
  if (id.serviceToken) return 'admin'; // owner's vended dev token
  if (!id.email) return 'viewer';
  if (env.BOOTSTRAP_ADMIN && id.email === env.BOOTSTRAP_ADMIN.toLowerCase()) return 'admin';
  return (await env.CAMPSITES.get(`${ROLE_PREFIX}${id.email}`)) === 'admin' ? 'admin' : 'viewer';
}

export async function whoami(env: AuthEnv, req: Request) {
  const id = identify(req);
  const role = await roleFor(env, id);
  return { email: id.email, serviceToken: id.serviceToken, role, isAdmin: role === 'admin' };
}

// Hono middleware: 403 unless the caller is an admin.
export function adminOnly() {
  return async (c: Context, next: Next) => {
    const role = await roleFor(c.env, identify(c.req.raw));
    if (role !== 'admin') return c.json({ error: 'admin role required' }, 403);
    await next();
  };
}
