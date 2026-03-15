# dev-server MCP — External Service Registration

## Problem

The MCP only tracks servers it spawns itself. External services (transit-tracker web on :8080, OrbStack Docker host, launchd-managed daemons) are invisible to the dashboard and can be accidentally killed by `killProcessOnPort`.

### Specific failures

1. **`python` type crashes** when no auto-detected entry point exists (`server.py`, `app.py`, `main.py`, `api.py`) — `findPythonEntry` returns `null`, which blows up `spawn(pythonBin, [null])` with `"path" argument must be of type string`.
2. **Port 8080 is unprotected** — OrbStack or transit-tracker's web server may be running there, and `dev_server_start` will kill it without asking.
3. **Dashboard at `/servers`** only shows MCP-managed servers; no way to surface external service URLs (e.g., transit-tracker API spec at `:8080/api/spec`).

---

## Plan

### 1. New tool: `dev_server_register`

Register an external service the MCP did not start. Adds it to `dev-servers.json` and the dashboard without spawning or killing anything.

```js
// index.js — new tool definition
{
  name: 'dev_server_register',
  description: 'Register an already-running external service so it appears on the dashboard. Does NOT start or kill anything.',
  inputSchema: {
    type: 'object',
    properties: {
      port:         { type: 'number', description: 'Port the service is listening on' },
      name:         { type: 'string', description: 'Display name (e.g. "Transit Tracker API Spec")' },
      url_path:     { type: 'string', description: 'URL path on the service (e.g. "/api/spec")' },
      project_dir:  { type: 'string', description: 'Project directory (optional, for dashboard grouping)' },
      tailscale_path: { type: 'string', description: 'Tailscale serve path to set up (optional)' },
    },
    required: ['port', 'name'],
  },
}
```

**Behavior:**
- Verify port is actually in use (error if free — service must be running)
- Record in state with `type: 'external'` and `managed: false`
- Optionally set up Tailscale serve route via `setupTailscaleHttpProxy()` (plain HTTP proxy — **not** `setupTailscaleServe()` which uses `https+insecure://` and expects the backend to speak HTTPS). Most external services (transit-tracker, OrbStack, custom Python servers) serve plain HTTP; Tailscale Serve handles TLS termination.
- Dashboard shows it alongside managed servers

> **Note:** The existing `startVite()` and `startJupyter()` also use `setupTailscaleServe()` (`https+insecure://`). This works for Vite because it auto-upgrades, but is incorrect for plain HTTP backends. Consider migrating all server types to use `setupTailscaleHttpProxy()` unless the backend explicitly serves HTTPS.

**State entry shape:**
```json
{
  "type": "external",
  "managed": false,
  "port": 8080,
  "name": "Transit Tracker API Spec",
  "url_path": "/api/spec",
  "project_dir": "/Users/tommydoerr/dev/transit_tracker",
  "localUrl": "http://tommys-mac-mini.local:8080/api/spec",
  "tailscaleUrl": "https://tommys-mac-mini.tail59a169.ts.net/tt-api"
}
```

### 2. Port protection

In `killProcessOnPort` and `dev_server_start`, check if the port belongs to a `managed: false` entry. If so, **refuse to kill** and return an error:

```
Error: Port 8080 is registered as external service "Transit Tracker API Spec" (managed: false). Will not kill.
```

Also add a `protected_ports` array to state (seeded with `[8080]`) that prevents killing even unregistered processes on those ports without explicit override.

### 3. Custom command for `python` type

Add optional `command` parameter to `dev_server_start`:

```js
command: {
  type: 'string',
  description: 'Custom shell command to start the server (e.g. "transit-tracker web"). Overrides auto-detection for python type.',
}
```

When `command` is provided:
- Skip `findPythonEntry` entirely
- Spawn via `sh -c <command>` with `PORT` env var set
- Still track PID, wait for port, set up Tailscale, etc.

### 4. Dashboard updates

`writeDashboard` in `dashboard.js` should handle external entries:
- Show `name` instead of `path.basename(project_dir)` for external services
- Include `url_path` in the link (e.g., `http://localhost:8080/api/spec`)
- Visual distinction (different dot color or label) for external vs managed

### 5. `dev_server_stop` guard

When stopping a server, check `managed: false`. If external:
- Remove from dashboard/state (unregister)
- Remove Tailscale serve route if configured
- Do NOT kill the process

---

## File changes

| File | Change |
|------|--------|
| `index.js` | Add `dev_server_register` tool; add `command` param to `dev_server_start`; guard `dev_server_stop` for external entries |
| `lib/servers.js` | `startPython`: accept `command` param, skip `findPythonEntry` when provided |
| `lib/state.js` | `addServer`: support `managed` field; new `isProtectedPort()` helper |
| `lib/process.js` | `killProcessOnPort`: accept optional `force` flag; check protected ports |
| `lib/dashboard.js` | `writeDashboard`: handle external entries with name/url_path |
| `lib/python-helper.js` | No changes needed (bypassed when `command` provided) |

---

## Immediate use case

Once implemented, registering transit-tracker's API spec:

```
dev_server_register({
  port: 8080,
  name: "Transit Tracker",
  url_path: "/api/spec",
  project_dir: "/Users/tommydoerr/dev/transit_tracker",
  tailscale_path: "/tt-api"
})
```

This surfaces it on the `/servers` dashboard and creates a Tailscale route at `https://tommys-mac-mini.tail59a169.ts.net/tt-api` → `http://127.0.0.1:8080/api/spec`.
