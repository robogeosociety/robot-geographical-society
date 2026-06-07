# Local Vite against the deployed Worker (Cloudflare Access)

How the local dev frontend talks to the **deployed** Worker backend without ever
putting a credential in the browser bundle.

## The shape

```
browser ──/api/availability──▶ Vite dev server ──+CF-Access service token──▶ Cloudflare Access ──▶ Worker
 (no token)                     (Node, holds token)                          (validates, forwards)
```

The browser only ever calls the **same-origin** `/api/...` path. The Vite dev server
(`vite.config.js`) proxies that to the deployed Worker and attaches a Cloudflare
Access **service token** as request headers — server-side, in Node. Because only
`VITE_`-prefixed env vars are inlined into the client bundle, the token
(`CF_ACCESS_CLIENT_*`, `BACKEND_URL`) never reaches the browser. The proxy also
sidesteps CORS (every browser request is same-origin).

In production the same browser code points at `VITE_BACKEND_URL` and authenticates
via an Access **SSO cookie** the browser carries automatically — so the service
token is a dev-only artifact, and the app code is identical in both modes (it goes
through `apiBase()` in `src/apiBase.js`).

> Auth-rule note: this does not contradict the workspace "never mint tokens" rule —
> that rule is about CLI auth (don't mint a Cloudflare API token / GitHub PAT when
> the OAuth code flow covers it). You still `wrangler login` via OAuth to deploy. An
> Access **service token** is the intended machine-to-machine credential, issued by
> Access for exactly this purpose.

## One-time setup

### 1. Deploy the Worker

```sh
cd backend && npx wrangler deploy
```

Note the printed URL, e.g. `https://robot-geographical-society-backend.<sub>.workers.dev`.

### 2. Put a Cloudflare Access application in front of it

In the Zero Trust dashboard (one.dash.cloudflare.com → Access → Applications →
**Add an application** → **Self-hosted**):

- **Application domain:** the Worker hostname from step 1 (or a custom route/subdomain
  bound to it).
- **Policies:** add two —
  - an **Allow** policy with an *Emails* / *identity* rule for human SSO (you), and
  - a **Service Auth** policy with a *Service Token* rule (created next) so the dev
    proxy can authenticate non-interactively.

> Requires Zero Trust enabled on the account (free tier is fine) and a team domain
> (`<team>.cloudflareaccess.com`).

### 3. Create the service token

Zero Trust → Access → **Service Auth** → **Service Tokens** → *Create*. Copy the
**Client ID** and **Client Secret** (the secret is shown once). Make sure the
application's Service Auth policy references this token.

### 4. Wire local dev

```sh
cp web/.env.local.example web/.env.local   # gitignored
# fill in BACKEND_URL, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET
cd web && npm run dev
```

Frontend calls `${apiBase()}/availability?...` → `/api/availability` → proxied to the
Worker with the service-token headers. Unset `BACKEND_URL` to fall back to a local
`wrangler dev` backend (the CI/e2e default — no proxy, no token).

## Production (later)

Deploy the frontend to Cloudflare Pages behind the **same** Access application; human
visitors get an SSO login and the browser carries the Access JWT cookie. Set
`VITE_BACKEND_URL` to the Worker origin at build time. No service token in prod.

## Optional hardening: verify the Access JWT in the Worker

Access blocks unauthenticated requests at the edge, so the Worker only sees vetted
traffic. For defense in depth (so a leaked direct Worker URL still can't be hit),
verify the `Cf-Access-Jwt-Assertion` header against your team's public keys at
`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, scoped to the read
routes. Add this once the read endpoints (PR #79) land on `main`.
