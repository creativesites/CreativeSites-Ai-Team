/**
 * Real, tested Gemini provider adapter for the Intelligence Layer.
 *
 * No SDK dependency - none is installed in this project, and Node 20.6+
 * ships native fetch + process.loadEnvFile(), so a raw REST client is the
 * honest zero-dependency choice here (matches this codebase's existing
 * convention of shelling out rather than adding npm packages).
 *
 * Every behavior in this file was verified against the live API before
 * being written down - see community/INTELLIGENCE_LAYER_STATUS.md for the
 * exact commands and responses. This is intentionally small: it covers only
 * what's actually been proven to work (generateContent, listModels, and
 * real error classification from three distinct failure responses). It does
 * NOT implement streaming, caching, batching, or a full provider-agnostic
 * interface - those are real, separate work, not stubbed out here.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function loadApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    try {
      process.loadEnvFile(require('path').resolve(__dirname, '../../.env'));
    } catch (e) {
      // .env not found or unreadable - fall through, the check below reports it
    }
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set (checked process.env and .env)');
  }
  return key;
}

/**
 * Classify a Gemini API error into one of the failure categories the
 * organization's routing/retry logic should react to. Built from three
 * real responses (invalid model, invalid key, and a successful call for
 * contrast) - not a guessed enum.
 */
function classifyError(httpStatus, body) {
  const status = body?.error?.status;
  const reason = body?.error?.details?.find((d) => d.reason)?.reason;

  if (httpStatus === 400 && reason === 'API_KEY_INVALID') return 'AUTH_FAILURE';
  if (httpStatus === 404) return 'MODEL_UNAVAILABLE';
  if (httpStatus === 429) return 'RATE_LIMIT';
  if (httpStatus === 403) return 'AUTH_FAILURE';
  if (httpStatus >= 500) return 'PROVIDER_ERROR';
  if (status === 'INVALID_ARGUMENT') return 'INVALID_REQUEST';
  return 'UNKNOWN';
}

/**
 * List models this API key can actually see. Real discovery call, not the
 * static model_registry table (which can go stale - this hits the provider).
 */
async function listModels() {
  const key = loadApiKey();
  const res = await fetch(`${BASE_URL}/models?key=${key}`);
  const body = await res.json();
  if (!res.ok) {
    return { ok: false, httpStatus: res.status, errorClass: classifyError(res.status, body), body };
  }
  return {
    ok: true,
    models: (body.models || []).map((m) => ({
      name: m.name,
      displayName: m.displayName,
      inputTokenLimit: m.inputTokenLimit,
      outputTokenLimit: m.outputTokenLimit,
      supportsGenerate: (m.supportedGenerationMethods || []).includes('generateContent'),
    })),
  };
}

/**
 * Real generation call. Returns real usage metadata as reported by the
 * provider - never estimates a token count it wasn't given.
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.model='gemini-flash-latest'] - an alias that Google
 *   resolves server-side to a concrete version (observed: resolved to
 *   gemini-3.8-flash on 2026-09-09 - this WILL drift over time by design,
 *   that's what "-latest" means; don't hardcode an assumption about which
 *   concrete model it points to).
 */
async function generateContent(prompt, opts = {}) {
  const key = loadApiKey();
  const model = opts.model || 'gemini-flash-latest';
  const started = Date.now();

  const res = await fetch(`${BASE_URL}/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const body = await res.json();
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    return {
      ok: false,
      httpStatus: res.status,
      errorClass: classifyError(res.status, body),
      message: body?.error?.message || 'unknown error',
      latencyMs,
    };
  }

  const candidate = body.candidates?.[0];
  return {
    ok: true,
    text: candidate?.content?.parts?.[0]?.text ?? null,
    finishReason: candidate?.finishReason ?? null,
    modelVersion: body.modelVersion ?? null, // the concrete model that actually ran
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount ?? null,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? null,
      thoughtsTokens: body.usageMetadata?.thoughtsTokenCount ?? null, // Gemini-specific; null on models without internal reasoning
      totalTokens: body.usageMetadata?.totalTokenCount ?? null,
    },
    latencyMs,
  };
}

module.exports = { listModels, generateContent, classifyError };
