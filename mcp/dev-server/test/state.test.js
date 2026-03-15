import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

let tmpDir;
let stateFile;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
  stateFile = path.join(tmpDir, 'dev-servers.json');
  process.env.DEV_SERVER_STATE_FILE = stateFile;
});

afterEach(() => {
  delete process.env.DEV_SERVER_STATE_FILE;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Dynamic import so each test picks up the env var
async function loadModule() {
  // Cache-bust by adding query param
  const mod = await import(`../lib/state.js?t=${Date.now()}-${Math.random()}`);
  return mod;
}

describe('state', () => {
  it('returns empty servers when no state file exists', async () => {
    const { getServers } = await loadModule();
    const servers = getServers();
    assert.deepEqual(servers, {});
  });

  it('addServer persists and getServerByPort retrieves', async () => {
    const { addServer, getServerByPort } = await loadModule();
    addServer({
      port: 5100,
      type: 'vite',
      pid: process.pid,
      project_dir: '/tmp/test',
    });

    const entry = getServerByPort(5100);
    assert.equal(entry.type, 'vite');
    assert.equal(entry.port, 5100);
    assert.equal(entry.project_dir, '/tmp/test');
    assert.equal(entry.running, true); // Current process is alive
    assert.ok(entry.started_at);
  });

  it('removeServer deletes entry', async () => {
    const { addServer, removeServer, getServerByPort } = await loadModule();
    addServer({
      port: 5200,
      type: 'jupyter',
      pid: process.pid,
      project_dir: '/tmp/test2',
    });
    assert.ok(getServerByPort(5200));

    removeServer(5200);
    assert.equal(getServerByPort(5200), null);
  });

  it('getServers prunes dead PIDs and preserves alive ones', async () => {
    const { addServer, getServers } = await loadModule();
    // Add a server with current PID (alive)
    addServer({
      port: 5300,
      type: 'vite',
      pid: process.pid,
      project_dir: '/tmp/alive',
    });
    // Add a server with a dead PID
    addServer({
      port: 5301,
      type: 'jupyter',
      pid: 999999,
      project_dir: '/tmp/dead',
    });

    const servers = getServers();
    // Both should be returned (alive shows running, dead shows not running)
    assert.equal(servers['5300'].running, true);
    assert.equal(servers['5301'].running, false);

    // After getServers, the state file should only have the alive one
    const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.ok(raw.servers['5300']);
    assert.equal(raw.servers['5301'], undefined);
  });

  it('getServerByPort returns null for nonexistent port', async () => {
    const { getServerByPort } = await loadModule();
    assert.equal(getServerByPort(9999), null);
  });

  it('addServer overwrites existing entry on same port', async () => {
    const { addServer, getServerByPort } = await loadModule();
    addServer({
      port: 5400,
      type: 'vite',
      pid: process.pid,
      project_dir: '/tmp/v1',
    });
    addServer({
      port: 5400,
      type: 'jupyter',
      pid: process.pid,
      project_dir: '/tmp/v2',
    });

    const entry = getServerByPort(5400);
    assert.equal(entry.type, 'jupyter');
    assert.equal(entry.project_dir, '/tmp/v2');
  });

  it('state file is valid JSON after writes', async () => {
    const { addServer } = await loadModule();
    addServer({
      port: 5500,
      type: 'vite',
      pid: process.pid,
      project_dir: '/tmp/json',
    });

    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw); // Should not throw
    assert.ok(parsed.servers['5500']);
  });
});
