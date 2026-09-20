// Purpose: Verify the distributable CLI's offline command and fail-closed argument handling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
test('CLI evaluates an explicitly marked fixture', () => {
  const result = spawnSync(process.execPath, ['bin/decisionpacks.mjs', 'run', 'packs/support-triage.json', 'examples/billing-state.json', '--fixture', 'examples/synthetic-billing-response.json'], { cwd, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).record.outcome, 'billing');
  assert.equal(JSON.parse(result.stdout).source, 'fixture');
});
test('CLI rejects unknown flags instead of treating them as a live request', () => {
  const result = spawnSync(process.execPath, ['bin/decisionpacks.mjs', 'run', 'packs/support-triage.json', 'examples/billing-state.json', '--unknown', 'value'], { cwd, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /fixture/);
});
