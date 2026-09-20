# DecisionPacks

**Ship a decision as a versioned, testable dependency.**

[![Tests](https://github.com/gbesse/decisionpacks/actions/workflows/test.yml/badge.svg)](https://github.com/gbesse/decisionpacks/actions/workflows/test.yml)
[MIT](LICENSE) · Node.js 22+ · No runtime dependencies · Public alpha

DecisionPacks wraps Jev's typed judgments in portable contracts: declared inputs,
pinned models, validated responses, deterministic gates, audit records and policy replay.
It produces decisions; your application controls any resulting action.

```text
Versioned pack + state → Jev (or an explicit test provider)
                      → validate every answer
                      → deterministic gates
                      → decision + provenance

Changed gates + historical judgments → migration diff, no extra inference
```

## Try it in 30 seconds

```sh
git clone https://github.com/gbesse/decisionpacks.git
cd decisionpacks
npm run demo
npm test
```

The offline demo routes a synthetic ticket to `billing`, raises its probability
threshold from 0.90 to 0.97, then shows that the same judgment would become `review`.
No key, install or build is required. These fixture probabilities are not measured Jev results.

```sh
node bin/decisionpacks.mjs validate packs/support-triage.json
node bin/decisionpacks.mjs run packs/support-triage.json examples/billing-state.json --fixture examples/synthetic-billing-response.json
```

## Call real Jev

Set `TYPESAFE_API_KEY` in your environment, then run:

```sh
node bin/decisionpacks.mjs run packs/support-triage.json examples/billing-state.json
```

This makes a paid request to `https://api.typesafe.ai/v1/systemone`.
No automatic retry is made: the caller owns retry and spending policy.
The provider has a 30-second default timeout, prohibits redirects and validates the
actual returned model against the version in your pack.

No live Jev benchmark is claimed in this release. The adapter is tested against a
local HTTP server implementing the documented request and response protocol.

## Use as a dependency

GitHub distribution (not an npm registry release):

```sh
npm install github:gbesse/decisionpacks#v0.1.0
```

```js
import { evaluate, createJevProvider } from '@gbesse/decisionpacks';
import { readFile } from 'node:fs/promises';

const pack = JSON.parse(await readFile('./my-pack.json', 'utf8'));
const record = await evaluate(pack, { text: 'I was charged twice.' }, {
  provider: createJevProvider(),
  // Optional: persist records before returning control to the caller.
  onRecord: async record => auditStore.append(record),
});
console.log(record.outcome);
```

`auditStore` above is your application's persistence adapter. Any provider, validation,
or audit failure rejects the call. The caller should report unexpected failures to its
configured administrator alerting system; there is no silent success fallback.

## Included packs

| Pack | Input | Output |
| --- | --- | --- |
| `support/triage` | Customer text | billing / technical / sales / review |
| `commerce/refund-review` | Text + verified identity + host-computed age and cents | eligible_for_review / review |
| `support/cancellation` | Customer text | retention_review / resolved / review |

Thresholds are illustrative defaults, **not calibrated performance guarantees**.
Refund eligibility never executes a payment. Arithmetic, authentication and authorization
remain deterministic host responsibilities.

## Policy migration without re-running the model

```js
import { replay } from '@gbesse/decisionpacks';
const changes = replay(newPack, [{ record: oldRecord, state: originalState }]);
```

You must supply the original state from your own protected storage. Audit records omit raw
state by default. Replay verifies its fingerprint and refuses changed questions or models:
those require fresh inference. Fingerprints detect accidental changes, not malicious tampering;
records are not cryptographically signed attestations.

## Extend it

A pack is JSON, not executable plugin code. Add your questions, declare required inputs,
and compose ordered rules using `eq`, `neq`, `lt`, `lte`, `gt`, `gte`.
Choice, Noul and Score are supported. The first matching rule wins; no match yields the
explicit fallback. Missing/malformed required inputs and responses are errors.

See [pack format](docs/pack-format.md), [contribution guide](CONTRIBUTING.md), and
[release validation](docs/validation.md). You can provide any async provider implementing
the same typed contract; claiming equivalent calibration requires your own evidence.

## The small ecosystem

- [Autonomy Meter](https://github.com/gbesse/autonomy-meter): evaluate thresholds using labeled outcomes and a holdout.
- [IntentBus](https://github.com/gbesse/intentbus): turn judgments into persistent business-event transitions.

Implemented now: pack runtime, CLI, three examples, replay, response validation and test seams.
Possible next work: pack registry, signed releases, richer input schemas and organization policies.
There is no hosted registry, marketplace or automatic learning service in this alpha.

Independent project; not affiliated with TypeSafe AI. Protocol reference:
[TypeSafe API](https://docs.typesafe.ai/api), [confidence](https://docs.typesafe.ai/confidence),
[known model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
