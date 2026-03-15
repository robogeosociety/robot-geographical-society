import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getViteBase, ensureViteAllowedHost } from '../lib/vite-helper.js';

describe('vite-helper', () => {
  let tempDir;
  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-test-'));
  });
  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('getViteBase returns / by default', () => {
    assert.equal(getViteBase(tempDir), '/');
  });

  it('getViteBase detects base from vite.config.ts', () => {
    fs.writeFileSync(path.join(tempDir, 'vite.config.ts'), 'export default { base: "/my-app/" }');
    assert.equal(getViteBase(tempDir), '/my-app/');
  });

  it('ensureViteAllowedHost adds hostname to config', () => {
    const configPath = path.join(tempDir, 'vite.config.ts');
    fs.writeFileSync(configPath, 'export default { server: { port: 3000 } }');
    ensureViteAllowedHost(tempDir, 'test-host');
    const content = fs.readFileSync(configPath, 'utf-8');
    assert.ok(content.includes('"test-host"'));
  });
});
