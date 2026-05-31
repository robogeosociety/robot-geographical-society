// Test-only stub for the `cloudflare:workers` runtime module (not resolvable in
// Node/vitest). Lets index.ts import the Workflow classes so the Hono route
// tests can run. The real module is used by the wrangler build/runtime.
export class WorkflowEntrypoint {}
export class WorkflowStep {}
export class WorkflowEvent {}
