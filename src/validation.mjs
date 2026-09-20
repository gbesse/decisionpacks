// Purpose: Validate portable decision contracts without evaluating user-supplied code.
export function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateJSON(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { ensure(Number.isFinite(value), 'JSON numbers must be finite'); return; }
  ensure(Array.isArray(value) || (object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))), 'Input must contain only JSON values');
  ensure(!seen.has(value), 'Cyclic input is not JSON');
  seen.add(value);
  for (const child of Object.values(value)) validateJSON(child, seen);
  seen.delete(value);
}

export function probability(value, label) {
  ensure(Number.isFinite(value) && value >= 0 && value <= 1, `${label} must be a probability`);
}

export function pathParts(path) {
  ensure(typeof path === 'string' && path.length > 0, 'Expected a nonempty field path');
  const parts = path.split('.');
  ensure(parts.every(part => /^[a-zA-Z0-9_-]+$/.test(part) && !['__proto__', 'prototype', 'constructor'].includes(part)), `Unsafe path: ${path}`);
  return parts;
}

export function get(value, path) {
  for (const part of pathParts(path)) {
    if (!object(value) || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

const OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
export function validatePredicate(predicate, roots = ['state', 'answers']) {
  ensure(object(predicate), 'Predicate must be an object');
  const parts = pathParts(predicate.field);
  ensure(roots.includes(parts[0]) && parts.length > 1, `Invalid predicate root: ${predicate.field}`);
  ensure(OPERATORS.has(predicate.op), `Unsupported operator: ${predicate.op}`);
  ensure(['string', 'boolean', 'number'].includes(typeof predicate.value), 'Predicate value must be scalar');
  if (typeof predicate.value === 'number') ensure(Number.isFinite(predicate.value), 'Predicate value must be finite');
  if (!['eq', 'neq'].includes(predicate.op)) ensure(typeof predicate.value === 'number', 'Ordered comparisons require numbers');
}

export function matches(predicate, context) {
  const actual = get(context, predicate.field);
  // Missing or mistyped facts must not accidentally satisfy a negative/ordered gate.
  if (actual === undefined || typeof actual !== typeof predicate.value) return false;
  switch (predicate.op) {
    case 'eq': return actual === predicate.value;
    case 'neq': return actual !== predicate.value;
    case 'gt': return actual > predicate.value;
    case 'gte': return actual >= predicate.value;
    case 'lt': return actual < predicate.value;
    case 'lte': return actual <= predicate.value;
    default: throw new Error(`Unsupported operator: ${predicate.op}`);
  }
}

export function validatePack(pack) {
  validateJSON(pack);
  ensure(object(pack) && pack.schemaVersion === 1, 'Unsupported pack schemaVersion (expected 1)');
  ensure(typeof pack.name === 'string' && /^[a-z0-9][a-z0-9/-]*$/.test(pack.name), 'Invalid pack name');
  ensure(typeof pack.description === 'string' && pack.description.length > 0, 'Pack requires a description');
  ensure(/^\d+\.\d+\.\d+$/.test(pack.version), 'Pack version must be x.y.z');
  ensure(typeof pack.model === 'string' && pack.model.length > 0 && !/latest|preview/.test(pack.model), 'Pin a versioned model');
  ensure(object(pack.inputs) && Object.keys(pack.inputs).length > 0, 'Pack requires inputs');
  for (const [field, type] of Object.entries(pack.inputs)) {
    pathParts(field);
    ensure(['string', 'number', 'boolean'].includes(type), `Unsupported input type for ${field}`);
  }
  ensure(object(pack.questions) && Object.keys(pack.questions).length > 0, 'Pack requires questions');
  for (const [id, q] of Object.entries(pack.questions)) {
    ensure(pathParts(id).length === 1, 'Question ids cannot contain dots');
    ensure(object(q) && ['choice', 'noul', 'score'].includes(q.type), `Invalid question ${id}`);
    ensure(typeof q.instructions === 'string' && q.instructions.trim().length > 0, `Question ${id} requires instructions`);
    if (q.type === 'choice') {
      ensure(object(q.criteria) && Object.keys(q.criteria).length >= 2 && Object.keys(q.criteria).length <= 255, `Invalid choice criteria: ${id}`);
      for (const [option, description] of Object.entries(q.criteria)) {
        ensure(pathParts(option).length === 1, 'Option ids cannot contain dots');
        ensure(description === null || typeof description === 'string', `Invalid option description: ${id}`);
      }
    }
    if (q.type === 'score') ensure(Array.isArray(q.criteria) && q.criteria.length >= 2 && q.criteria.length <= 10 && q.criteria.every(x => typeof x === 'string'), `Invalid score criteria: ${id}`);
    if (q.type === 'noul' && q.criteria !== undefined) ensure(object(q.criteria) && Object.keys(q.criteria).every(k => ['true', 'false'].includes(k) && typeof q.criteria[k] === 'string'), `Invalid noul criteria: ${id}`);
  }
  ensure(typeof pack.fallback === 'string' && pack.fallback.length > 0, 'Pack requires a fallback outcome');
  ensure(Array.isArray(pack.rules), 'Pack requires rules');
  const ids = new Set();
  for (const rule of pack.rules) {
    ensure(object(rule) && typeof rule.id === 'string' && rule.id.length > 0 && !ids.has(rule.id), 'Rule ids must be unique nonempty strings');
    ids.add(rule.id);
    ensure(typeof rule.outcome === 'string' && rule.outcome.length > 0, 'Rule requires an outcome');
    ensure(Array.isArray(rule.all) && rule.all.length > 0, 'Rule requires at least one predicate');
    for (const predicate of rule.all) {
      validatePredicate(predicate);
      const [root, question, ...rest] = pathParts(predicate.field);
      if (root === 'state') {
        const field = [question, ...rest].join('.');
        ensure(Object.hasOwn(pack.inputs, field), `Undeclared input ${predicate.field}`);
        ensure(typeof predicate.value === pack.inputs[field], `Invalid comparison type: ${predicate.field}`);
      }
      if (root === 'answers') {
        const q = pack.questions[question];
        ensure(Object.hasOwn(pack.questions, question), `Unknown question ${question}`);
        const field = rest.join('.');
        const allowed = q.type === 'noul' ? ['noul'] : q.type === 'choice' ? ['choice', 'confidence', ...Object.keys(q.criteria).map(k => `probabilities.${k}`)] : ['score', 'confidence', ...q.criteria.map((_, i) => `probabilities.${i}`)];
        ensure(allowed.includes(field), `Invalid answer field ${predicate.field}`);
        ensure(typeof predicate.value === (field === 'choice' ? 'string' : 'number'), `Invalid comparison type: ${predicate.field}`);
        if (field === 'choice') ensure(Object.hasOwn(q.criteria, predicate.value), `Unknown choice ${predicate.value}`);
        else if (field !== 'score') probability(predicate.value, predicate.field);
      }
    }
  }
  return pack;
}

export function validateState(pack, state) {
  validateJSON(state);
  ensure(object(state), 'State must be an object');
  for (const [field, type] of Object.entries(pack.inputs)) {
    const value = get(state, field);
    ensure(typeof value === type && (type !== 'number' || Number.isFinite(value)), `Missing or invalid input: ${field} (${type})`);
  }
}

export function validateAnswers(questions, answers) {
  ensure(object(answers), 'Missing answers');
  ensure(Object.keys(answers).length === Object.keys(questions).length, 'Unexpected answer count');
  for (const [id, q] of Object.entries(questions)) {
    const a = answers[id];
    ensure(Object.hasOwn(answers, id) && object(a) && a.type === q.type, `Missing or mistyped answer: ${id}`);
    if (q.type === 'noul') { probability(a.noul, id); continue; }
    probability(a.confidence, `${id}.confidence`);
    ensure(object(a.probabilities), `Missing probabilities: ${id}`);
    const keys = q.type === 'choice' ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
    ensure(Object.keys(a.probabilities).length === keys.length && keys.every(k => Object.hasOwn(a.probabilities, k)), `Probability options mismatch: ${id}`);
    keys.forEach(k => probability(a.probabilities[k], `${id}.${k}`));
    ensure(Math.abs(keys.reduce((sum, k) => sum + a.probabilities[k], 0) - 1) <= 0.001, `Probabilities must sum to 1: ${id}`);
    if (q.type === 'choice') {
      ensure(keys.includes(a.choice), `Unknown choice: ${id}`);
      ensure(a.probabilities[a.choice] >= Math.max(...Object.values(a.probabilities)) - 0.001, `Choice is not highest probability: ${id}`);
    } else {
      const expected = keys.reduce((sum, k) => sum + Number(k) * a.probabilities[k], 0);
      ensure(Number.isFinite(a.score) && a.score >= 0 && a.score <= keys.length - 1 && Math.abs(a.score - expected) <= 0.01, `Invalid expected score: ${id}`);
    }
  }
}
