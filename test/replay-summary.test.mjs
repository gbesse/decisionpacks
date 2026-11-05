import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {evaluate,replaySummary}from '../src/index.mjs';
test('empty replay has no calls and no invented changes',()=>{const pack=JSON.parse(fs.readFileSync('packs/support-triage.json'));const x=replaySummary(pack,[]);assert.equal(x.total,0);assert.equal(x.providerCalls,0);});
test('duplicate receipt IDs cannot inflate transition counts',()=>{const pack=JSON.parse(fs.readFileSync('packs/support-triage.json'));assert.throws(()=>replaySummary(pack,[{record:{id:'x'}},{record:{id:'x'}}]),/Unique/);});
