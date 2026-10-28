/// <reference types="node" />
// R2Bucket stand-in backed by a directory on the mini's dev disk. Keys map to file
// paths under `root`, so the tree has the same layout as the campsite-raw bucket it
// replaced (raw/, summary/, sites/, dlq/, scheduler/) and the R2 export copies in as is.
// Implements the subset the collector, notifier and readiness scan use.
import { mkdir, readdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

type Body = { key: string; text(): Promise<string>; json<T = unknown>(): Promise<T> };

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err: any) {
    if (err?.code === "ENOENT") return;
    throw err;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && !e.name.startsWith(".")) out.push(p);
  }
}

export class FsBucket {
  constructor(private root: string) {}

  private path(key: string): string {
    if (key.split("/").includes("..")) throw new Error(`bad key ${key}`);
    return join(this.root, key);
  }

  async get(key: string): Promise<Body | null> {
    let text: string;
    try {
      text = await readFile(this.path(key), "utf8");
    } catch (err: any) {
      if (err?.code === "ENOENT") return null;
      throw err;
    }
    return { key, text: async () => text, json: async <T>() => JSON.parse(text) as T };
  }

  async head(key: string) {
    return (await this.get(key)) ? { key } : null;
  }

  // Write to a temp file and rename, so a crashed run never leaves a torn object.
  async put(key: string, value: string | ArrayBuffer | Uint8Array) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    await writeFile(tmp, typeof value === "string" ? value : new Uint8Array(value as ArrayBuffer));
    await rename(tmp, p);
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }

  // Walks only the directory the prefix names, then filters. `cursor` is the index to
  // resume from; with `delimiter`, folds deeper keys into delimitedPrefixes like R2.
  async list(opts: { prefix?: string; cursor?: string; limit?: number; delimiter?: string } = {}) {
    const prefix = opts.prefix ?? "";
    const base = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";
    const files: string[] = [];
    await walk(join(this.root, base), files);
    const keys = files
      .map((f) => relative(this.root, f).split(sep).join("/"))
      .filter((k) => k.startsWith(prefix) && !k.endsWith(".tmp"))
      .sort();
    let objects = keys;
    const delimitedPrefixes = new Set<string>();
    if (opts.delimiter) {
      objects = [];
      for (const k of keys) {
        const rest = k.slice(prefix.length);
        const i = rest.indexOf(opts.delimiter);
        if (i >= 0) delimitedPrefixes.add(prefix + rest.slice(0, i + opts.delimiter.length));
        else objects.push(k);
      }
    }
    const start = Number(opts.cursor ?? 0);
    const limit = opts.limit ?? 1000;
    const page = objects.slice(start, start + limit);
    const truncated = start + limit < objects.length;
    return {
      objects: page.map((key) => ({ key })),
      delimitedPrefixes: [...delimitedPrefixes],
      truncated,
      cursor: truncated ? String(start + limit) : undefined,
    };
  }
}
