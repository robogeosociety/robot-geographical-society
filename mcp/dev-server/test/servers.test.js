import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocatePort } from '../lib/servers.js';

describe('allocatePort', () => {
  it('returns a port in the 5100-5899 range', () => {
    const port = allocatePort('/home/user/my-project');
    assert.ok(port >= 5100, `Port ${port} below 5100`);
    assert.ok(port <= 5899, `Port ${port} above 5899`);
  });

  it('returns the same port for the same project directory', () => {
    const a = allocatePort('/home/user/tallest-tree');
    const b = allocatePort('/home/user/tallest-tree');
    assert.equal(a, b);
  });

  it('uses only basename so different paths with same project name match', () => {
    const a = allocatePort('/home/user/projects/my-app');
    const b = allocatePort('/Users/other/code/my-app');
    assert.equal(a, b);
  });

  it('returns different ports for different project names', () => {
    const a = allocatePort('/home/user/project-alpha');
    const b = allocatePort('/home/user/project-beta');
    // Could theoretically collide but extremely unlikely for these names
    assert.notEqual(a, b);
  });

  it('returns an integer', () => {
    const port = allocatePort('/tmp/test');
    assert.equal(port, Math.floor(port));
  });
});
