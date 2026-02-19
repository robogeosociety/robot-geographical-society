Start the local dev server and print access URLs.

## Steps

### 1. Kill any existing dev server on port 5173

```
lsof -ti :5173 | xargs kill -9 2>/dev/null; true
```

### 2. Install dependencies (in case package.json changed)

```
cd ~/dev/robot-geographical-society/web && npm install
```

### 3. Start the dev server

```
cd ~/dev/robot-geographical-society/web && npm run dev -- --host
```

Once the server is running, it is accessible at:

- Local:     http://localhost:5173
- Tailscale: http://100.119.31.10:5173
