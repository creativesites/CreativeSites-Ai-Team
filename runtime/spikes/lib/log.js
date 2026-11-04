// Append-only JSONL logger for one spike run.
//
// Files written under runs/<stamp>-<adapter>/:
//   messages.jsonl   every inbound/outbound ACP JSON-RPC message (sanitised)
//   events.jsonl     harness-side facts (client method calls, process sampling, …)
//   scenario-*.json  per-scenario result record
//   summary.json     machine-readable adapter summary
//   run.json         environment + spawn configuration

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class SpikeLog {
  constructor(dir) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.seq = 0;
  }

  path(name) {
    return join(this.dir, name);
  }

  append(file, obj) {
    appendFileSync(this.path(file), `${JSON.stringify(obj)}\n`);
  }

  /** One JSON-RPC message. `message` must already be sanitised by the caller. */
  message(direction, message, extra = {}) {
    this.seq += 1;
    this.append('messages.jsonl', {
      n: this.seq,
      ts: new Date().toISOString(),
      dir: direction, // 'recv' (adapter -> runtime) | 'send' (runtime -> adapter)
      message,
      ...extra,
    });
  }

  event(type, data = {}) {
    this.append('events.jsonl', { ts: new Date().toISOString(), type, ...data });
  }

  writeJson(name, obj) {
    writeFileSync(this.path(name), `${JSON.stringify(obj, null, 2)}\n`);
  }
}
