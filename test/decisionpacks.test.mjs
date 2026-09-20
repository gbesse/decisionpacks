// Purpose: Exercise policy boundaries, provenance, provider errors and actual HTTP protocol handling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { decide, evaluate, replay, validatePack, validateAnswers, fingerprint, createJevProvider } from '../src/index.mjs';
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const triage = await read('../packs/support-triage.json');
const refund = await read('../packs/refund-review.json');
const fixture = await read('../examples/synthetic-billing-response.json');
const state = { text: 'Double charged' };
const provider = async () => structuredClone(fixture);

test('all bundled packs validate', async () => {
  for (const name of ['support-triage', 'refund-review', 'cancellation']) validatePack(await read(`../packs/${name}.json`));
});
test('routes confident choices and falls back when policy tightens', () => {
  assert.equal(decide(triage, state, fixture.answers).outcome, 'billing');
  const pack = structuredClone(triage); pack.rules[0].all[1].value = 0.95;
  assert.deepEqual(decide(pack, state, fixture.answers), { outcome: 'review', ruleId: null });
});
test('refund guards require verified identity, valid age and amount', () => {
  const facts = { text: 'Refund please', customerVerified: true, daysSincePurchase: 30, amountCents: 10000 };
  const answers = { refundRequested: { type: 'noul', noul: 0.99 } };
  assert.equal(decide(refund, facts, answers).outcome, 'eligible_for_review');
  for (const change of [{ customerVerified: false }, { daysSincePurchase: -1 }, { daysSincePurchase: 31 }, { amountCents: 10001 }, { amountCents: 0 }]) assert.equal(decide(refund, { ...facts, ...change }, answers).outcome, 'review');
  assert.throws(() => decide(refund, { ...facts, amountCents: '10' }, answers), /invalid input/);
});
test('rejects malformed and missing answers rather than creating decisions', () => {
  for (const change of [{ confidence: NaN }, { choice: 'invented' }, { type: 'noul' }, { probabilities: { billing: 1 } }]) assert.throws(() => validateAnswers(triage.questions, { department: { ...fixture.answers.department, ...change } }));
  assert.throws(() => validateAnswers(triage.questions, {}), /count/);
  assert.throws(() => validateAnswers({ yes: { type: 'noul' } }, { yes: { type: 'noul', noul: 2 } }), /probability/);
});
test('score must agree with the returned distribution', () => {
  const questions = { rating: { type: 'score', criteria: ['low', 'medium', 'high'] } };
  const answers = { rating: { type: 'score', score: 1.5, confidence: 0.5, probabilities: { 0: 0, 1: 0.5, 2: 0.5 } } };
  validateAnswers(questions, answers);
  assert.throws(() => validateAnswers(questions, { rating: { ...answers.rating, score: 9 } }), /score/);
});
test('pack rejects mutable aliases, unsafe paths and undeclared questions', () => {
  assert.throws(() => validatePack({ ...triage, model: 'jev-latest' }), /Pin/);
  for (const field of ['state.__proto__.secret', 'answers.unknown.noul', 'state.undeclared']) {
    const pack = structuredClone(triage); pack.rules[0].all[0].field = field;
    assert.throws(() => validatePack(pack));
  }
});
test('input fingerprints are independent of key insertion order', () => {
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});
test('policy replay reuses judgments only for identical model, questions and state', async () => {
  const record = await evaluate(triage, state, { provider });
  const pack = structuredClone(triage); pack.version = '0.2.0'; pack.rules[0].all[1].value = 0.97;
  assert.equal(replay(pack, [{ record, state }])[0].after, 'review');
  assert.throws(() => replay(pack, [{ record, state: { text: 'other' } }]), /state/);
  pack.questions.department.instructions += ' changed';
  assert.throws(() => replay(pack, [{ record, state }]), /re-evaluate/);
});
test('provider and audit failures propagate without a fallback decision', async () => {
  await assert.rejects(evaluate(triage, state, { provider: async () => { throw new Error('offline'); } }), /offline/);
  await assert.rejects(evaluate(triage, state, { provider, onRecord: async () => { throw new Error('disk full'); } }), /disk full/);
  await assert.rejects(evaluate(triage, state, { provider: async () => ({ ...fixture, model: 'wrong' }) }), /model/);
});
test('caller mutations during inference cannot change provenance or policy', async () => {
  const pack = structuredClone(triage), input = { ...state };
  const record = await evaluate(pack, input, { provider: async request => {
    pack.rules = []; input.text = 'changed'; request.state.text = 'provider mutation';
    return fixture;
  } });
  assert.equal(record.outcome, 'billing');
  assert.equal(record.inputFingerprint, fingerprint(state));
});
test('invalid JSON values cannot silently change while serializing', async () => {
  await assert.rejects(evaluate(triage, { text: 'valid', extra: NaN }, { provider }), /finite/);
  await assert.rejects(evaluate(triage, { text: 'valid', extra: new Date() }, { provider }), /JSON/);
});
test('a custom provider has a deadline and explicit cancellation', async () => {
  await assert.rejects(evaluate(triage, state, { provider: async () => new Promise(() => {}), timeoutMs: 10 }), /timeout/);
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await assert.rejects(evaluate(triage, state, { provider, signal: controller.signal }), /cancelled/);
});

async function server(t, handler) {
  const s = createServer(handler); s.listen(0, '127.0.0.1'); await once(s, 'listening');
  t.after(() => { s.closeAllConnections(); s.close(); });
  return `http://127.0.0.1:${s.address().port}/v1/systemone`;
}
test('Jev adapter sends the documented wire shape and validates real HTTP responses', async t => {
  const endpoint = await server(t, async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(req.headers.authorization, 'Bearer test-key');
    assert.deepEqual(JSON.parse(body), { model: triage.model, state, questions: triage.questions });
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fixture));
  });
  const result = await evaluate(triage, state, { provider: createJevProvider({ apiKey: 'test-key', endpoint }) });
  assert.equal(result.outcome, 'billing');
});
test('HTTP errors, redirects, bad JSON and hung bodies fail explicitly', async t => {
  for (const code of [401, 429, 529, 302]) {
    const endpoint = await server(t, (_, res) => { res.writeHead(code, { location: 'https://example.com' }); res.end(); });
    await assert.rejects(evaluate(triage, state, { provider: createJevProvider({ apiKey: 'test', endpoint }) }));
  }
  const bad = await server(t, (_, res) => res.end('not json'));
  await assert.rejects(evaluate(triage, state, { provider: createJevProvider({ apiKey: 'test', endpoint: bad }) }));
  const slow = await server(t, (_, res) => { res.writeHead(200); res.write('{'); });
  await assert.rejects(evaluate(triage, state, { provider: createJevProvider({ apiKey: 'test', endpoint: slow, timeoutMs: 30 }) }), /abort|timeout/i);
});
