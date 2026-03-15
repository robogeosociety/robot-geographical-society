import fs from 'fs';
import path from 'path';
import os from 'os';
import { writeDashboard } from './dashboard.js';

function getStatePath() {
  if (process.env.DEV_SERVER_STATE_FILE) return process.env.DEV_SERVER_STATE_FILE;
  return path.join(os.homedir(), '.claude', 'dev-servers.json');
}

function loadState() {
  try {
    const data = fs.readFileSync(getStatePath(), 'utf8');
    return JSON.parse(data);
  } catch {
    return { servers: {} };
  }
}

function saveState(state) {
  const stateFile = getStatePath();
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const tmp = stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, stateFile);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function addServer(entry) {
  const state = loadState();
  state.servers[String(entry.port)] = {
    ...entry,
    started_at: new Date().toISOString(),
  };
  saveState(state);
  writeDashboard(state.servers);
}

export function removeServer(port) {
  const state = loadState();
  delete state.servers[String(port)];
  saveState(state);
  writeDashboard(state.servers);
}

export function getServers() {
  const state = loadState();
  const alive = {};
  for (const [port, entry] of Object.entries(state.servers)) {
    if (entry.pid && isProcessAlive(entry.pid)) {
      alive[port] = { ...entry, running: true };
    } else {
      alive[port] = { ...entry, running: false };
    }
  }
  // Prune dead entries
  const pruned = {};
  for (const [port, entry] of Object.entries(alive)) {
    if (entry.running) pruned[port] = entry;
  }
  saveState({ servers: pruned });
  writeDashboard(pruned);
  return alive;
}

export function getServerByPort(port) {
  const state = loadState();
  const entry = state.servers[String(port)];
  if (!entry) return null;
  return {
    ...entry,
    running: entry.pid ? isProcessAlive(entry.pid) : false,
  };
}
