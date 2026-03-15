process.title = 'dev-dashboard';

import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PORT = parseInt(process.env.DASHBOARD_PORT || '5099', 10);
const FILE = process.env.DASHBOARD_FILE || path.join(os.homedir(), '.claude', 'dev-servers.md');

http.createServer((req, res) => {
  try {
    const content = fs.readFileSync(FILE, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    res.end('# Active Dev Servers\n\n_No servers tracked yet._\n');
  }
}).listen(PORT, '127.0.0.1');
