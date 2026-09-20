# Pack format v1

This document specifies the deliberately small JSON contract supported by the runtime.

Required fields: `schemaVersion: 1`, `name`, semantic `version`, `description`, pinned
`model`, `inputs`, `questions`, ordered `rules`, and `fallback`.

`inputs` maps dot-separated state paths to `string`, `number` or `boolean`. Additional
state fields are allowed but all state must be JSON data. Rules cannot reference undeclared
inputs. Paths use own properties only; prototype-related names are forbidden.

`questions` uses the Jev API shape. This alpha accepts string instructions and string
criteria descriptions (Choice descriptions may be null). Choice has 2–255 options;
Score has 2–10 zero-indexed levels. Noul's optional criteria use `true` and `false` keys.

Each rule has a unique `id`, an `outcome` and a nonempty `all` array of predicates:

```json
{
  "field": "answers.department.probabilities.billing",
  "op": "gte",
  "value": 0.9
}
```

Rules are evaluated in order. Predicates support exact scalar comparisons and numeric
ordering, with no coercion or JavaScript evaluation. Noul exposes `noul`. Choice exposes
`choice`, `confidence`, `probabilities.<option>`. Score exposes `score`, `confidence`,
`probabilities.<index>`. Negative guards do not match missing values.

Jev's `confidence` is not an empirical correctness probability. Prefer explicitly named
probabilities when analyzing results and validate thresholds against labeled outcomes.

Providers receive `{ model, state, questions, signal }` and return `{ model, answers }`.
Responses must include every requested answer exactly once. Probability distributions
must sum to one within 0.001; selected choices must maximize probability within that
tolerance. Score must agree with its weighted levels within 0.01.

`evaluate(pack, state, { provider, signal, timeoutMs, onRecord })` snapshots inputs and
bounds provider execution, even for a custom provider ignoring cancellation. The default
is 30 seconds. Custom providers should honor the signal to avoid continuing work after timeout.
`onRecord` is an optional host audit callback, awaited before success; the host owns its
storage deadline. No input text is retained in the returned record.

`replay(pack, [{record, state}])` changes gates only and returns before/after outcomes.
Question/model/input fingerprints must match. A question change means re-evaluation.
Pack versions are author-managed; fingerprints reveal content changes even if a version
was accidentally reused. Record hashes are provenance checks, not signatures.
