import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import axios from 'axios';

const app = new Hono();
const NOMAD_ADDR = process.env.NOMAD_ADDR || 'http://127.0.0.1:4646';

async function fetchDevServers() {
  const response = await axios.get(`${NOMAD_ADDR}/v1/jobs`);
  const jobs = response.data.filter(j => j.ID.startsWith('dev-') && j.ID !== 'dev-dashboard');

  return Promise.all(jobs.map(async (j) => {
    const details = await axios.get(`${NOMAD_ADDR}/v1/job/${j.ID}`);
    const meta = details.data?.TaskGroups?.[0]?.Tasks?.[0]?.Meta || {};
    return {
      id: j.ID,
      status: j.Status,
      type: meta.type || 'unknown',
      dir: meta.project_dir || '',
      port: meta.port || '',
      ts_path: meta.tailscale_path || '',
    };
  }));
}

app.get('/', async (c) => {
  try {
    const servers = await fetchDevServers();
    const runningCount = servers.filter(s => s.status === 'running').length;
    const totalCount = servers.length;
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dev Servers</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    :root {
      --bg-primary: #121826;
      --bg-secondary: #1a2235;
      --bg-card: #1e2a3a;
      --bg-card-hover: #243044;
      --border: #2a3a50;
      --border-subtle: #1f2f42;
      --text-primary: #e8ecf2;
      --text-secondary: #8899aa;
      --text-muted: #5a6a7a;
      --green: #2fdb6f;
      --green-bg: rgba(47,219,111,0.12);
      --red: #f45b69;
      --red-bg: rgba(244,91,105,0.12);
      --yellow: #f5a623;
      --yellow-bg: rgba(245,166,35,0.12);
      --blue: #3b82f6;
      --blue-bg: rgba(59,130,246,0.12);
      --purple: #a78bfa;
      --purple-bg: rgba(167,139,250,0.12);
      --cyan: #22d3ee;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }

    /* Top nav */
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      height: 48px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .topbar-left { display: flex; align-items: center; gap: 12px; }
    .logo {
      display: flex; align-items: center; gap: 8px;
      font-weight: 700; font-size: 14px; color: var(--text-primary);
      letter-spacing: -0.3px;
    }
    .logo-icon {
      width: 22px; height: 22px;
      background: linear-gradient(135deg, var(--blue), var(--purple));
      border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; color: white; font-weight: 700;
    }
    .nav-sep { width: 1px; height: 20px; background: var(--border); }
    .nav-item {
      font-size: 13px; color: var(--text-secondary);
      text-decoration: none; padding: 4px 8px; border-radius: 4px;
      transition: all 0.15s;
    }
    .nav-item:hover { color: var(--text-primary); background: var(--bg-card); }
    .nav-item.active { color: var(--text-primary); background: var(--bg-card); }
    .topbar-right { display: flex; align-items: center; gap: 12px; }
    .live-badge {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 600; color: var(--green);
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .live-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--green);
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(47,219,111,0.4); }
      50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(47,219,111,0); }
    }
    .last-update { font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }

    /* Summary bar */
    .summary {
      display: flex; gap: 1px; padding: 20px 24px;
      background: var(--bg-primary);
    }
    .summary-card {
      flex: 1; padding: 16px 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
    }
    .summary-card:first-child { border-radius: 8px 0 0 8px; }
    .summary-card:last-child { border-radius: 0 8px 8px 0; }
    .summary-label {
      font-size: 11px; font-weight: 600; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;
    }
    .summary-value {
      font-size: 28px; font-weight: 700; letter-spacing: -1px;
      font-family: 'JetBrains Mono', monospace;
    }
    .summary-value.green { color: var(--green); }
    .summary-value.yellow { color: var(--yellow); }
    .summary-value.blue { color: var(--cyan); }
    .summary-sub {
      font-size: 11px; color: var(--text-muted); margin-top: 2px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Content */
    .content { padding: 0 24px 24px; }
    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 13px; font-weight: 600; color: var(--text-secondary);
      text-transform: uppercase; letter-spacing: 0.5px;
    }

    /* Table */
    .table-wrap {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      text-align: left;
      padding: 10px 16px;
      font-size: 11px; font-weight: 600; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.5px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
    }
    tbody tr {
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.1s;
    }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: var(--bg-card-hover); }
    td { padding: 12px 16px; font-size: 13px; }

    /* Status */
    .status-cell { display: flex; align-items: center; gap: 8px; }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .status-dot.running { background: var(--green); box-shadow: 0 0 6px rgba(47,219,111,0.5); }
    .status-dot.dead { background: var(--red); }
    .status-dot.pending { background: var(--yellow); animation: pulse 1.5s ease-in-out infinite; }
    .status-label { font-weight: 500; font-size: 12px; text-transform: capitalize; }
    .status-label.running { color: var(--green); }
    .status-label.dead { color: var(--red); }
    .status-label.pending { color: var(--yellow); }

    /* Type badge */
    .type-badge {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.5px; padding: 3px 8px; border-radius: 4px;
    }
    .type-badge.vite { background: var(--purple-bg); color: var(--purple); }
    .type-badge.jupyter { background: var(--yellow-bg); color: var(--yellow); }
    .type-badge.python { background: var(--blue-bg); color: var(--blue); }
    .type-badge.unknown { background: var(--bg-secondary); color: var(--text-muted); }

    /* Service name */
    .service-name {
      font-weight: 600; font-size: 13px; color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
    }
    .service-dir {
      font-size: 11px; color: var(--text-muted); margin-top: 2px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Links */
    .endpoint-link {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px; font-family: 'JetBrains Mono', monospace;
      color: var(--blue); text-decoration: none;
      padding: 3px 8px; border-radius: 4px;
      background: var(--blue-bg);
      transition: all 0.15s; margin-right: 6px; margin-bottom: 4px;
    }
    .endpoint-link:hover { background: rgba(59,130,246,0.2); color: #60a5fa; }
    .endpoint-link svg { width: 12px; height: 12px; }

    /* Stop button */
    .stop-btn {
      display: inline-flex; align-items: center; gap: 4px;
      background: transparent; color: var(--red); border: 1px solid var(--red);
      border-radius: 5px; padding: 5px 12px;
      font-size: 12px; font-weight: 600; cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: all 0.15s;
    }
    .stop-btn:hover { background: var(--red-bg); }
    .stop-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .stop-btn svg { width: 12px; height: 12px; }

    /* Empty state */
    .empty-state {
      text-align: center; padding: 60px 20px;
      color: var(--text-muted);
    }
    .empty-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.3; }
    .empty-title { font-size: 15px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
    .empty-sub { font-size: 13px; }

    /* Responsive */
    @media (max-width: 768px) {
      .summary { flex-direction: column; gap: 8px; }
      .summary-card { border-radius: 8px !important; }
      .table-wrap { overflow-x: auto; }
      table { min-width: 700px; }
    }

    /* Fade-in */
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    tbody tr { animation: fadeIn 0.3s ease; }
    tbody tr:nth-child(2) { animation-delay: 0.05s; }
    tbody tr:nth-child(3) { animation-delay: 0.1s; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-left">
      <div class="logo">
        <div class="logo-icon">N</div>
        Nomad Dev
      </div>
      <div class="nav-sep"></div>
      <a class="nav-item active" href="/">Infrastructure</a>
    </div>
    <div class="topbar-right">
      <div class="live-badge"><div class="live-dot"></div> Live</div>
      <div class="last-update" id="last-update"></div>
    </div>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="summary-label">Total Services</div>
      <div class="summary-value blue">${totalCount}</div>
      <div class="summary-sub">across all jobs</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Running</div>
      <div class="summary-value green">${runningCount}</div>
      <div class="summary-sub">healthy</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Unhealthy</div>
      <div class="summary-value yellow">${totalCount - runningCount}</div>
      <div class="summary-sub">need attention</div>
    </div>
  </div>

  <div class="content">
    <div class="section-header">
      <div class="section-title">Service Overview</div>
    </div>

    ${servers.length === 0 ? `
    <div class="table-wrap">
      <div class="empty-state">
        <div class="empty-icon">&#9656;</div>
        <div class="empty-title">No active dev servers</div>
        <div class="empty-sub">Start a dev server via Claude to see it here</div>
      </div>
    </div>` : `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Service</th>
            <th>Type</th>
            <th>Endpoints</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${servers.map(s => `
          <tr id="row-${s.id}">
            <td>
              <div class="status-cell">
                <div class="status-dot ${s.status}"></div>
                <span class="status-label ${s.status}">${s.status}</span>
              </div>
            </td>
            <td>
              <div class="service-name">${s.id}</div>
              <div class="service-dir">${s.dir ? s.dir.replace(/.*\/dev\//, '~/dev/') : ''}</div>
            </td>
            <td><span class="type-badge ${s.type}">${s.type}</span></td>
            <td>
              ${s.port ? `<a class="endpoint-link" href="http://tommys-mac-mini.local:${s.port}" target="_blank"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 3.5h-3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-3M9.5 2.5h4v4M6.5 9.5l7-7"/></svg>:${s.port}</a>` : ''}
              ${s.ts_path ? `<a class="endpoint-link" href="https://tommys-mac-mini.tail59a169.ts.net${s.ts_path}" target="_blank"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zM1 8h14M8 1c2 2.3 2 9.7 0 12M8 1c-2 2.3-2 9.7 0 12"/></svg>${s.ts_path}</a>` : ''}
            </td>
            <td style="text-align:right">
              ${s.status === 'running' ? `<button class="stop-btn" onclick="stopJob('${s.id}','${s.ts_path}')"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>Stop</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}
  </div>

  <script>
    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
    setTimeout(() => location.reload(), 10000);

    async function stopJob(id, tsPath) {
      if (!confirm('Stop ' + id + '?')) return;
      const btn = event.target.closest('.stop-btn');
      btn.disabled = true;
      btn.innerHTML = '<span style="opacity:0.7">Stopping\\u2026</span>';
      try {
        await fetch('/api/stop', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({job_id: id, tailscale_path: tsPath || undefined})
        });
        const row = document.getElementById('row-' + id);
        row.style.opacity = '0.3';
        row.style.transition = 'opacity 0.3s';
        setTimeout(() => location.reload(), 1500);
      } catch(e) {
        btn.innerHTML = 'Error';
      }
    }
  </script>
</body>
</html>`;
    return c.html(html);
  } catch (error) {
    return c.html(`<h1>Error</h1><pre>${error.message}</pre>`, 500);
  }
});

app.get('/api/servers', async (c) => {
  try {
    const servers = await fetchDevServers();
    return c.json({ servers });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

app.post('/api/stop', async (c) => {
  try {
    const { job_id, tailscale_path } = await c.req.json();
    await axios.delete(`${NOMAD_ADDR}/v1/job/${job_id}?purge=true`);
    if (tailscale_path) {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const exec = promisify(execFile);
      try {
        await exec('tailscale', ['serve', '--set-path', tailscale_path, 'off']);
      } catch { /* best effort */ }
    }
    return c.json({ status: 'stopped', job_id });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

const port = parseInt(process.env.PORT || '9000');
console.log(`Dashboard running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
