// Cloudflare Pages Function: same-origin `/api/*` → the backend Worker over an
// internal service binding (BACKEND). The Pages app is gated by Cloudflare Access
// (SSO), so only an authenticated owner reaches this; the binding then calls the
// Worker directly — no public hop, no credential in the browser, no CORS. This is the
// production equivalent of the Vite dev proxy.
export async function onRequest(context) {
  const { request, env } = context;
  if (!env.BACKEND) {
    return new Response('backend service binding not configured', { status: 503 });
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  // Host is irrelevant — the service binding routes to the Worker, which matches on path.
  const forwarded = new Request(`https://backend${path}${url.search}`, request);
  return env.BACKEND.fetch(forwarded);
}
