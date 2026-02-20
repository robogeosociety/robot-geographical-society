Start the local dev server and print access URLs.

## Steps

### 1. Kill any existing dev server and wait for port to free

```
lsof -ti :5173 | xargs kill -9 2>/dev/null; while lsof -ti :5173 &>/dev/null; do sleep 0.1; done; true
```

> Note: if a previous `/dev` background task reports "failed with exit code 137" after this step, that is expected — 137 = SIGKILL of the old server. Ignore it and continue.

### 2. Install dependencies (in case package.json changed)

```
cd ~/dev/robot-geographical-society/web && npm install
```

### 3. Start the dev server in the background

Run this command **in the background** (`run_in_background: true`), then wait 3 seconds and tail the output file to confirm the server is ready before printing the URLs.

```
cd ~/dev/robot-geographical-society/web && npm run dev -- --host
```

Once the server prints "ready", it is accessible at:

- Local:     http://localhost:5173
- Tailscale: http://100.119.31.10:5173
