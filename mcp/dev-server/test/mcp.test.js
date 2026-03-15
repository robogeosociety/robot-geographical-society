import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_JS = path.join(__dirname, '..', 'index.js');

function mcpCall(request) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'node',
      [INDEX_JS],
      { timeout: 10000 },
      (err, stdout, _stderr) => {
        if (err && !stdout) return reject(err);
        // Parse the JSON-RPC response from stdout
        try {
          const response = JSON.parse(stdout.trim());
          resolve(response);
        } catch (_e) {
          reject(new Error(`Failed to parse response: ${stdout}`));
        }
      },
    );
    child.stdin.write(`${JSON.stringify(request)}\n`);
    child.stdin.end();
  });
}

describe('MCP server', () => {
  it('lists all 5 tools via tools/list', async () => {
    const response = await mcpCall({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });

    assert.equal(response.id, 1);
    assert.ok(response.result.tools);
    assert.equal(response.result.tools.length, 5);

    const names = response.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'dev_server_start',
      'dev_server_status',
      'dev_server_stop',
      'dev_server_urls',
      'port_check',
    ]);
  });

  it('each tool has a description and inputSchema', async () => {
    const response = await mcpCall({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    for (const tool of response.result.tools) {
      assert.ok(tool.description, `${tool.name} missing description`);
      assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
      assert.equal(
        tool.inputSchema.type,
        'object',
        `${tool.name} schema type should be object`,
      );
    }
  });

  it('port_check returns free for an unused port', async () => {
    const response = await mcpCall({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'port_check', arguments: { port: 59500 } },
    });

    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.port, 59500);
    assert.equal(result.status, 'free');
  });

  it('dev_server_status returns empty list when nothing is tracked', async () => {
    const response = await mcpCall({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'dev_server_status', arguments: {} },
    });

    const result = JSON.parse(response.result.content[0].text);
    assert.ok(Array.isArray(result.servers));
  });

  it('dev_server_urls reports not listening for unused port', async () => {
    const response = await mcpCall({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'dev_server_urls', arguments: { port: 59501 } },
    });

    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.listening, false);
  });

  it('returns error for unknown tool', async () => {
    const response = await mcpCall({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });

    assert.ok(response.result.isError);
    assert.ok(response.result.content[0].text.includes('Unknown tool'));
  });

  it('dev_server_start returns error for unknown type', async () => {
    const response = await mcpCall({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'dev_server_start',
        arguments: { type: 'invalid', project_dir: '/tmp' },
      },
    });

    assert.ok(response.result.isError);
    assert.ok(response.result.content[0].text.includes('Unknown server type'));
  });
});
