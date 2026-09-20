#!/usr/bin/env node
// Purpose: Validate packs, evaluate with Jev or explicit fixtures, and compare gate changes.
import { readFile } from 'node:fs/promises';
import { validatePack, evaluate, createJevProvider, replay } from '../src/index.mjs';
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
async function main() {
  const [command, packPath, inputPath, fixtureFlag, fixturePath, ...extra] = process.argv.slice(2);
  if (!command || command === '--help') {
    console.log('decisionpacks validate PACK.json\ndecisionpacks run PACK.json STATE.json [--fixture RESPONSE.json]\ndecisionpacks replay PACK.json RECORDS.json\nA fixture is synthetic/offline; run without --fixture calls the paid Jev API.');
    return;
  }
  if (!['validate', 'run', 'replay'].includes(command) || !packPath || extra.length) throw new Error('Invalid arguments; use --help');
  const pack = validatePack(await readJSON(packPath));
  if (command === 'validate') {
    if (inputPath || fixtureFlag || fixturePath) throw new Error('validate accepts one pack path');
    console.log(JSON.stringify({ valid: true, name: pack.name, version: pack.version }));
    return;
  }
  if (!inputPath) throw new Error('Input path is required');
  if (command === 'replay') {
    if (fixtureFlag || fixturePath) throw new Error('replay accepts only pack and records paths');
    console.log(JSON.stringify(replay(pack, await readJSON(inputPath)), null, 2));
    return;
  }
  if ((fixtureFlag && fixtureFlag !== '--fixture') || Boolean(fixtureFlag) !== Boolean(fixturePath)) throw new Error('Use --fixture RESPONSE.json');
  const fixture = fixturePath ? await readJSON(fixturePath) : null;
  const record = await evaluate(pack, await readJSON(inputPath), { provider: fixture ? async () => fixture : createJevProvider() });
  console.log(JSON.stringify({ source: fixture ? 'fixture' : 'live', record }, null, 2));
}
main().catch(error => { console.error(`decisionpacks: ${error.message}`); process.exitCode = 1; });
