// Purpose: Show that trusted host facts, rather than model probability alone, gate refund review.
import { readFile } from 'node:fs/promises';
import { evaluate } from '../src/index.mjs';

const pack = JSON.parse(await readFile(new URL('../packs/refund-review.json', import.meta.url), 'utf8'));
const response = {
  model: pack.model,
  answers: { refundRequested: { type: 'noul', noul: 0.99 } },
};
const base = {
  text: 'Please refund my fictional order.',
  daysSincePurchase: 12,
  amountCents: 4200,
  customerVerified: true,
};
const scenarios = [
  ['verified, inside policy', base],
  ['identity not verified', { ...base, customerVerified: false }],
  ['maximum permitted amount', { ...base, amountCents: 10000 }],
  ['one cent above limit', { ...base, amountCents: 10001 }],
  ['purchase 31 days ago', { ...base, daysSincePurchase: 31 }],
];

for (const [scenario, state] of scenarios) {
  const record = await evaluate(pack, state, { provider: async () => response });
  console.log(`${scenario}: ${record.outcome}`);
}
console.log('Synthetic probability; host-computed facts; no API call or payment.');
