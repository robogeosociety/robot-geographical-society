/**
 * Base URL for Worker backend calls — the single switch between dev and prod so the
 * browser never holds a backend credential. Build request URLs as
 * `` `${apiBase()}/availability?...` `` (no `/api` segment in the path you write).
 *
 * - **Dev:** returns `'/api'` → requests go to the same-origin `/api/...` path, which
 *   the Vite dev server proxies to the deployed Worker (stripping the `/api` prefix)
 *   and attaches the Cloudflare Access service token as request headers
 *   *server-side* — the token is never in the bundle. See web/BACKEND_AUTH.md.
 * - **Prod:** returns `VITE_BACKEND_URL` (the deployed Worker origin), so the URL is
 *   `<backend>/availability`. The deployed frontend authenticates via an Access SSO
 *   cookie the browser carries automatically — again, no token in JS. Falls back to
 *   `'/api'` (same-origin routing) when `VITE_BACKEND_URL` is unset.
 */
export function apiBase() {
  // Dev always goes through the proxy so the Access service token is applied
  // server-side, even if VITE_BACKEND_URL happens to be set.
  if (import.meta.env.DEV) return '/api';
  const explicit = import.meta.env.VITE_BACKEND_URL;
  return explicit ? explicit.replace(/\/+$/, '') : '/api';
}
