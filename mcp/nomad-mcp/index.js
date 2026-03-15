#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { generateDevJob, submitJob, stopJob, getJobs, getJob } from './lib/nomad.js';
import { setupTailscaleServe, removeTailscaleServe, getTailscaleUrlFromPort } from './lib/tailscale.js';
import { ensureDashboard } from './lib/dashboard.js';

const server = new Server(
  {
    name: 'nomad-dev-server-mcp',
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
        description: 'Start a dev server (Vite, Jupyter, or Python) as a Nomad job with optional Tailscale exposure.',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['vite', 'jupyter', 'python'], description: 'Server type' },
            project_dir: { type: 'string', description: 'Absolute path to the project root directory' },
            port: { type: 'number', description: 'Port number to use' },
            tailscale_path: { type: 'string', description: 'Path to expose via Tailscale Serve (e.g. /myapp)' },
          },
          required: ['type', 'project_dir', 'port'],
        },
      },
      {
        name: 'dev_server_stop',
        description: 'Stop and purge a Nomad-managed dev server by Job ID. Also cleans up its Tailscale route.',
        inputSchema: {
          type: 'object',
          properties: {
            job_id: { type: 'string', description: 'Nomad Job ID (e.g. dev-myproject-vite)' },
            tailscale_path: { type: 'string', description: 'Override: Tailscale path to remove (auto-detected from job meta if omitted)' },
          },
          required: ['job_id'],
        },
      },
      {
        name: 'dev_server_status',
        description: 'List all Nomad-managed dev servers with their health, metadata, and Tailscale URLs.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'dev_dashboard_deploy',
        description: 'Deploy (or verify) the persistent dev-dashboard Nomad job and register it on Tailscale at /servers.',
        inputSchema: {
          type: 'object',
          properties: {},
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
        const { type, project_dir, port, tailscale_path } = args;
        const job = generateDevJob({ type, projectDir: project_dir, port, tailscalePath: tailscale_path });

        // Stop any existing job with the same ID first
        await stopJob(job.ID).catch(() => {});

        await submitJob(job);

        let tailscaleUrl = null;
        if (tailscale_path) {
          tailscaleUrl = await setupTailscaleServe(tailscale_path, port);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'started',
              job_id: job.ID,
              port,
              localUrl: `http://tommys-mac-mini.local:${port}`,
              tailscaleUrl,
            }, null, 2)
          }]
        };
      }

      case 'dev_server_stop': {
        const { job_id, tailscale_path: providedPath } = args;

        let pathToRemove = providedPath;
        if (!pathToRemove) {
          const job = await getJob(job_id);
          const meta = job?.TaskGroups?.[0]?.Tasks?.[0]?.Meta || {};
          pathToRemove = meta.tailscale_path || null;
        }

        await stopJob(job_id);
        if (pathToRemove) {
          await removeTailscaleServe(pathToRemove);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'stopped', job_id, tailscale_removed: !!pathToRemove }, null, 2)
          }]
        };
      }

      case 'dev_server_status': {
        const allJobs = await getJobs();
        const devJobs = allJobs.filter(j => j.ID.startsWith('dev-'));

        const servers = await Promise.all(devJobs.map(async (j) => {
          const details = await getJob(j.ID);
          const meta = details?.TaskGroups?.[0]?.Tasks?.[0]?.Meta || {};
          const port = parseInt(meta.port);
          const tsUrl = port ? await getTailscaleUrlFromPort(port) : null;

          return {
            job_id: j.ID,
            status: j.Status,
            type: meta.type,
            project_dir: meta.project_dir,
            port,
            localUrl: port ? `http://tommys-mac-mini.local:${port}` : null,
            tailscaleUrl: tsUrl,
          };
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ servers }, null, 2)
          }]
        };
      }

      case 'dev_dashboard_deploy': {
        const result = await ensureDashboard();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
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
