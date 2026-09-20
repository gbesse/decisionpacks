// Purpose: Compile-check representative public API usage, without running code or calling Jev.
import { evaluate, decide, replay, validatePack, createJevProvider, type Pack } from '../src/index.mjs';
const pack: Pack = validatePack({});
const state = { text: 'Synthetic' };
const provider = createJevProvider({ apiKey: 'typecheck-only' });
const record = await evaluate(pack, state, { provider });
decide(pack, state, record.answers);
replay(pack, [{ record, state }]);
// @ts-expect-error Required provider cannot be omitted.
evaluate(pack, state, {});
