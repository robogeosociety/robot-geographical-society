/// <reference types="node" />
// Analytics Engine stand-in: each writeDataPoint() appends one JSON line to
// <dir>/<dataset>.jsonl, in the same shape the AE export used (blobN / doubleN / index1),
// so the exported history and new rows read the same way.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type DataPoint = { indexes?: string[]; blobs?: string[]; doubles?: number[] };

export class JsonlDataset {
  private file: string;

  constructor(dir: string, private dataset: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, `${dataset}.jsonl`);
  }

  writeDataPoint(p: DataPoint) {
    const row: Record<string, unknown> = { dataset: this.dataset, timestamp: new Date().toISOString() };
    (p.indexes ?? []).forEach((v, i) => (row[`index${i + 1}`] = v));
    (p.blobs ?? []).forEach((v, i) => (row[`blob${i + 1}`] = v));
    (p.doubles ?? []).forEach((v, i) => (row[`double${i + 1}`] = v));
    appendFileSync(this.file, JSON.stringify(row) + "\n");
  }
}
