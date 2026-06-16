/**
 * Base URL for backend calls — always the same-origin `/api` path, so the browser
 * never holds a backend credential in either environment:
 *
 * - **Dev:** the Vite dev server proxies `/api/*` to the deployed Worker and attaches
 *   the Cloudflare Access service token server-side (see vite.config.js).
 * - **Prod (Cloudflare Pages):** a Pages Function at `/api/*` forwards to the backend
 *   Worker over an internal service binding (see web/functions/api/[[path]].js); the
 *   Pages app itself is gated by Cloudflare Access SSO.
 *
 * Build request URLs as `` `${apiBase()}/availability?...` `` (no `/api` in the path
 * you write).
 */
export function apiBase() {
  return '/api';
}
