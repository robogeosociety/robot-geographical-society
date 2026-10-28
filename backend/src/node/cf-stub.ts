// The runner bundles workflows.ts for collectSite and the DLQ helpers, which pulls in
// the Workers-only `cloudflare:workers` module. esbuild aliases it to this stub.
export class WorkflowEntrypoint {}
export class WorkflowStep {}
export class WorkflowEvent {}
