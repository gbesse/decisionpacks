// Purpose: Show a reproducible offline policy migration using a synthetic provider response.
import { readFile } from 'node:fs/promises';
import { evaluate, replay } from '../src/index.mjs';
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const pack = await read('../packs/support-triage.json');
const state = await read('./billing-state.json');
const response = await read('./synthetic-billing-response.json');
const record = await evaluate(pack, state, { provider: async () => response });
const tightened = structuredClone(pack);
tightened.version = '0.2.0';
tightened.rules[0].all[1].value = 0.97;
console.log(JSON.stringify({ source: 'synthetic fixture, no API call', original: record.outcome, migration: replay(tightened, [{ record, state }]) }, null, 2));
