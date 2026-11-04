// Pure mapping from the usage an ACP adapter reports to MyaOS usage fields (K6, WP10 10.1).
//
// Adapters disagree on shape, so this reads every shape seen so far and never guesses:
//  - legacy flat fields:      inputTokens / outputTokens / tokensIn / tokensOut / costCents
//  - ACP `usage_update`:      { used, size, cost: { amount, currency } }  (context window, not tokens)
//  - nested `_meta.usage`:    on a prompt result or an update
//  - Claude style:            input_tokens, cache_read_input_tokens, cache_creation_input_tokens, output_tokens
// When nothing numeric is present the result is measurement 'unavailable'. It is never turned into an
// "actual" zero, because a missing report is not evidence that nothing was used.
//
// The team uses subscription plans: there are no prices. `cost.amount` of a usage_update is a currency
// figure in an unspecified unit, so it is deliberately NOT read as cents. Only an explicit costCents /
// cost_cents field (the legacy contract) is carried.

export type UsageMeasurement = 'actual' | 'estimated' | 'unavailable';

export interface MappedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  /** Tokens currently in the context window, as the adapter reports it (`used`). null when not reported. */
  contextUsed: number | null;
  /** The context window size the adapter reports (`size`). null when not reported. */
  contextSize: number | null;
  /** Legacy explicit cost in cents; 0 unless the adapter sent costCents / cost_cents. */
  costCents: number;
  /** A real model id when the usage object names one. */
  modelId: string | null;
  /** true when at least one token counter was reported. */
  hasTokens: boolean;
  measurement: UsageMeasurement;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function toCount(v: unknown): number | null {
  if (typeof v === 'string' && v.trim() !== '') v = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

/** Objects that may hold usage fields, most specific first. */
function candidates(src: unknown): Obj[] {
  if (!isObj(src)) return [];
  const out: Obj[] = [];
  if (isObj(src.usage)) out.push(src.usage);
  const meta = isObj(src._meta) ? src._meta : null;
  if (meta && isObj(meta.usage)) out.push(meta.usage);
  out.push(src);
  if (meta) out.push(meta);
  return out;
}

function pick(objs: Obj[], keys: string[]): number | null {
  for (const o of objs) {
    for (const k of keys) {
      const n = toCount(o[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

const INPUT = ['inputTokens', 'input_tokens', 'tokensIn', 'promptTokens', 'prompt_tokens'];
const OUTPUT = ['outputTokens', 'output_tokens', 'tokensOut', 'completionTokens', 'completion_tokens'];
const CACHED = ['cachedInputTokens', 'cached_input_tokens', 'cache_read_input_tokens', 'cacheReadInputTokens', 'cachedReadTokens', 'cachedTokens'];
const CACHE_WRITE = ['cacheWriteTokens', 'cache_write_tokens', 'cache_creation_input_tokens', 'cacheCreationInputTokens', 'cachedWriteTokens'];
const REASONING = ['reasoningTokens', 'reasoning_tokens', 'thoughtTokens', 'thought_tokens'];
const CONTEXT_USED = ['contextUsed', 'context_used', 'used'];
const CONTEXT_SIZE = ['contextSize', 'context_size', 'size'];
const COST_CENTS = ['costCents', 'cost_cents'];

/** Maps an ACP `session/update` (usage_update) or a `session/prompt` result to usage fields. */
export function mapAcpUsage(source: unknown): MappedUsage {
  const objs = candidates(source);
  const input = pick(objs, INPUT);
  const output = pick(objs, OUTPUT);
  const cached = pick(objs, CACHED);
  const cacheWrite = pick(objs, CACHE_WRITE);
  const reasoning = pick(objs, REASONING);
  const contextUsed = pick(objs, CONTEXT_USED);
  const contextSize = pick(objs, CONTEXT_SIZE);
  const cost = pick(objs, COST_CENTS);
  const hasTokens = [input, output, cached, cacheWrite, reasoning].some((n) => n !== null);
  const reported = hasTokens || contextUsed !== null || contextSize !== null || cost !== null;
  let modelId: string | null = null;
  for (const o of objs) {
    const m = o.model ?? o.modelId ?? o.model_id;
    if (typeof m === 'string' && m.trim()) {
      modelId = m.trim();
      break;
    }
  }
  return {
    inputTokens: input ?? 0,
    outputTokens: output ?? 0,
    cachedInputTokens: cached ?? 0,
    cacheWriteTokens: cacheWrite ?? 0,
    reasoningTokens: reasoning ?? 0,
    contextUsed,
    contextSize,
    costCents: cost ?? 0,
    modelId,
    hasTokens,
    measurement: reported ? 'actual' : 'unavailable',
  };
}

/**
 * The real model id an adapter reports, if any: `session/new` `models.currentModelId`, then `_meta`,
 * then the initialize `agentInfo`. The ACP agent name (agentInfo.name) is not a model id and is ignored.
 */
export function extractModelId(initResult: unknown, newSessionResult: unknown): string | null {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (isObj(newSessionResult)) {
    const models = newSessionResult.models;
    if (isObj(models)) {
      const cur = str(models.currentModelId) ?? str(models.current_model_id);
      if (cur) return cur;
    }
    const meta = isObj(newSessionResult._meta) ? newSessionResult._meta : null;
    const m = meta && (str(meta.model) ?? str(meta.modelId) ?? str(meta.model_id));
    if (m) return m;
  }
  if (isObj(initResult)) {
    const info = isObj(initResult.agentInfo) ? initResult.agentInfo : null;
    if (info) {
      const meta = isObj(info._meta) ? info._meta : null;
      const m = str(info.modelId) ?? str(info.model) ?? (meta && (str(meta.model) ?? str(meta.modelId)));
      if (m) return m;
    }
    const meta = isObj(initResult._meta) ? initResult._meta : null;
    const m = meta && (str(meta.model) ?? str(meta.modelId));
    if (m) return m;
  }
  return null;
}

/** Provider name for an adapter id, used to key the model registry and renewal policy. */
export function providerOfAdapter(adapterId: string | null | undefined): string | null {
  if (!adapterId) return null;
  switch (adapterId) {
    case 'claude':
      return 'anthropic';
    case 'gemini':
    case 'antigravity':
      return 'google';
    case 'codex':
      return 'openai';
    default:
      return adapterId;
  }
}
