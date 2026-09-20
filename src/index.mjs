// Purpose: Execute versioned decision packs and replay policy changes against recorded judgments.
import { createHash, randomUUID } from 'node:crypto';
import { ensure, object, validatePack, validateState, validateAnswers, matches } from './validation.mjs';
export { validatePack, validateAnswers } from './validation.mjs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function questionFingerprint(pack) { return fingerprint({ model: pack.model, questions: pack.questions }); }

export function decide(pack, state, answers) {
  validatePack(pack);
  validateState(pack, state);
  validateAnswers(pack.questions, answers);
  const rule = pack.rules.find(candidate => candidate.all.every(predicate => matches(predicate, { state, answers })));
  return { outcome: rule?.outcome ?? pack.fallback, ruleId: rule?.id ?? null };
}

export function createJevProvider({ apiKey = process.env.TYPESAFE_API_KEY, endpoint = 'https://api.typesafe.ai/v1/systemone', timeoutMs = 30_000, fetchImpl = globalThis.fetch } = {}) {
  ensure(typeof apiKey === 'string' && apiKey.length > 0, 'Set TYPESAFE_API_KEY to call Jev');
  ensure(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300_000, 'timeoutMs must be between 1 and 300000');
  const url = new URL(endpoint);
  ensure(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)), 'Endpoint must use HTTPS (loopback HTTP allowed for tests)');
  ensure(!url.username && !url.password, 'Endpoint cannot contain credentials');
  return async ({ model, state, questions, signal }) => {
    // One timeout covers both headers and the response body; redirects must never forward secrets.
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetchImpl(url, {
      method: 'POST', redirect: 'error',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, state, questions }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    ensure(response.ok, `Jev HTTP ${response.status}; no decision produced`);
    const result = await response.json();
    ensure(result.model === model, `Model mismatch: requested ${model}, received ${result.model}`);
    validateAnswers(questions, result.answers);
    return result;
  };
}

export async function evaluate(pack, state, { provider, signal, onRecord, timeoutMs = 30_000 } = {}) {
  validatePack(pack);
  validateState(pack, state);
  ensure(typeof provider === 'function', 'An explicit provider is required');
  ensure(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300_000, 'Invalid evaluation timeout');
  // Snapshot inputs before awaiting so caller mutations cannot alter a decision's provenance.
  pack = structuredClone(pack);
  state = structuredClone(state);
  const start = performance.now();
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  combined.throwIfAborted();
  let timer, abort;
  const deadline = new Promise((_, reject) => {
    abort = () => reject(combined.reason);
    combined.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => controller.abort(new Error('Decision provider timeout')), timeoutMs);
  });
  let result;
  try { result = await Promise.race([provider({ model: pack.model, questions: structuredClone(pack.questions), state: structuredClone(state), signal: combined }), deadline]); }
  finally { clearTimeout(timer); combined.removeEventListener('abort', abort); }
  ensure(result.model === pack.model, 'Provider returned an unexpected model');
  const decision = decide(pack, state, result.answers);
  const record = {
    schemaVersion: 1, id: randomUUID(), timestamp: new Date().toISOString(),
    pack: { name: pack.name, version: pack.version, fingerprint: fingerprint(pack) },
    questionFingerprint: questionFingerprint(pack), model: result.model,
    inputFingerprint: fingerprint(state), answers: structuredClone(result.answers), ...decision,
    latencyMs: Math.round((performance.now() - start) * 100) / 100,
  };
  // Persistence/reporting failures propagate; callers must not act before their audit sink succeeds.
  if (onRecord) await onRecord(structuredClone(record));
  return record;
}

export function replay(pack, records) {
  validatePack(pack);
  ensure(Array.isArray(records), 'Replay requires an array');
  return records.map(({ record, state }) => {
    ensure(record?.schemaVersion === 1 && record.pack?.name === pack.name, 'Record belongs to a different pack');
    ensure(record.model === pack.model && record.questionFingerprint === questionFingerprint(pack), 'Replay only supports gate changes; re-evaluate changed questions or models');
    ensure(record.inputFingerprint === fingerprint(state), 'Replay state does not match recorded input');
    const after = decide(pack, state, record.answers);
    return { id: record.id, before: record.outcome, after: after.outcome, ruleId: after.ruleId, changed: record.outcome !== after.outcome };
  });
}
