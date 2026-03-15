#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  getProcessOnPort,
  killProcessOnPort,
  isPortFree,
} from './lib/process.js';
import {
  startVite,
  startJupyter,
  startPython,
  registerExternal,
} from './lib/servers.js';
import { getServers, removeServer, getServerByPort } from './lib/state.js';
import { getTailscaleUrl, removeTailscaleServe } from './lib/tailscale.js';

const server = new Server(
  {
    name: 'dev-server-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'dev_server_start',
        description: 'Start a dev server (Vite, Jupyter, or Python). Kills any existing process on the target port, starts the server in background, optionally sets up Tailscale Serve, and returns access URLs.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['vite', 'jupyter', 'python'],
              description: 'Type of dev server to start',
            },
            project_dir: {
              type: 'string',
              description: 'Absolute path to the project root directory',
            },
            port: {
              type: 'number',
              description: 'Port number. If omitted, auto-assigned based on project directory name hash (range 5100-5899)',
            },
            background: {
              type: 'boolean',
              description: 'Run in background (default true)',
              default: true,
            },
            tailscale_path: {
              type: 'string',
              description: 'Path to expose via Tailscale Serve (e.g. \'/my-app\'). Omit to skip Tailscale.',
            },
            command: {
              type: 'string',
              description: 'Custom shell command to start the server (e.g. "transit-tracker web"). Overrides auto-detection for python type.',
            },
          },
          required: ['type', 'project_dir'],
        },
      },
      {
        name: 'dev_server_stop',
        description: 'Stop a running dev server by port. Kills the process and removes any Tailscale Serve route.',
        inputSchema: {
          type: 'object',
          properties: {
            port: {
              type: 'number',
              description: 'Port of the dev server to stop',
            },
            tailscale_path: {
              type: 'string',
              description: 'Tailscale serve path to remove (e.g. \'/my-app\'). Falls back to stored state if omitted.',
            },
          },
          required: ['port'],
        },
      },
      {
        name: 'dev_server_status',
        description: 'List all tracked dev servers with their ports, types, project directories, PIDs, and whether they are still running.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'dev_server_urls',
        description: 'Get local and Tailscale URLs for a dev server on a given port.',
        inputSchema: {
          type: 'object',
          properties: {
            port: {
              type: 'number',
              description: 'Port of the dev server',
            },
          },
          required: ['port'],
        },
      },
      {
        name: 'port_check',
        description: 'Check what process is running on a given port. Returns PID, process name, and command, or reports the port as free.',
        inputSchema: {
          type: 'object',
          properties: {
            port: {
              type: 'number',
              description: 'Port number to check',
            },
          },
          required: ['port'],
        },
      },
      {
        name: 'dev_server_register',
        description: 'Register an already-running external service so it appears on the dashboard. Does NOT start or kill anything. Use dev_server_stop to unregister.',
        inputSchema: {
          type: 'object',
          properties: {
            port: {
              type: 'number',
              description: 'Port the service is listening on',
            },
            name: {
              type: 'string',
              description: 'Display name (e.g. "Transit Tracker API")',
            },
            url_path: {
              type: 'string',
              description: 'URL path on the service (e.g. "/api/spec"). Defaults to "/".',
            },
            project_dir: {
              type: 'string',
              description: 'Project directory (optional, for dashboard grouping)',
            },
            tailscale_path: {
              type: 'string',
              description: 'Tailscale serve path to set up (e.g. "/tt-api"). Omit to skip.',
            },
          },
          required: ['port', 'name'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'dev_server_start': {
        const { type } = args;
        switch (type) {
          case 'vite':
            return { content: [{ type: 'text', text: JSON.stringify(await startVite(args), null, 2) }] };
          case 'jupyter':
            return { content: [{ type: 'text', text: JSON.stringify(await startJupyter(args), null, 2) }] };
          case 'python':
            return { content: [{ type: 'text', text: JSON.stringify(await startPython(args), null, 2) }] };
          default:
            throw new Error(`Unknown type: ${type}`);
        }
      }

      case 'dev_server_stop': {
        const { port } = args;
        const result = { port, stopped: false, tailscale_removed: false, unregistered: false };

        const entry = getServerByPort(port);
        if (entry?.managed === false) {
          // External service: unregister only, do not kill
          removeServer(port);
          result.unregistered = true;
          if (entry.tailscale_path) {
            await removeTailscaleServe(entry.tailscale_path).catch(() => {});
            result.tailscale_removed = true;
          }
          result.message = `External service "${entry.name}" on port ${port} unregistered (process not killed).`;
        } else {
          try {
            await killProcessOnPort(port);
            result.stopped = true;
          } catch (e) {
            // ignore
          }
          removeServer(port);
        }

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'dev_server_status': {
        const servers = await getServers();
        return { content: [{ type: 'text', text: JSON.stringify({ servers }, null, 2) }] };
      }

      case 'dev_server_urls': {
        const { port } = args;
        const localUrl = `http://tommys-mac-mini.local:${port}`;
        const tailscaleUrl = await getTailscaleUrl(port);
        return { content: [{ type: 'text', text: JSON.stringify({ port, localUrl, tailscaleUrl }, null, 2) }] };
      }

      case 'port_check': {
        const { port } = args;
        if (await isPortFree(port)) {
          return { content: [{ type: 'text', text: JSON.stringify({ port, status: 'free', message: `Port ${port} is available` }, null, 2) }] };
        }
        const info = await getProcessOnPort(port);
        return { content: [{ type: 'text', text: JSON.stringify({ port, status: 'in_use', ...info }, null, 2) }] };
      }

      case 'dev_server_register': {
        return { content: [{ type: 'text', text: JSON.stringify(await registerExternal(args), null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error: ${e.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
