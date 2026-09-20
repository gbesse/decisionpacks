// Purpose: Describe DecisionPacks' public API for TypeScript consumers without a build step.
export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };
export type Question = { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } } | { type: 'choice'; instructions: string; criteria: Record<string, string | null> } | { type: 'score'; instructions: string; criteria: string[] };
export type Answer = { type: 'noul'; noul: number } | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> } | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number>; legend?: Record<string, string> };
export interface Predicate { field: string; op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'; value: string | number | boolean }
export interface Pack { schemaVersion: 1; name: string; description: string; version: string; model: string; inputs: Record<string, 'string' | 'number' | 'boolean'>; questions: Record<string, Question>; rules: { id: string; outcome: string; all: Predicate[] }[]; fallback: string }
export interface DecisionRecord { schemaVersion: 1; id: string; timestamp: string; pack: { name: string; version: string; fingerprint: string }; questionFingerprint: string; model: string; inputFingerprint: string; answers: Record<string, Answer>; outcome: string; ruleId: string | null; latencyMs: number }
export type Provider = (request: { model: string; state: Record<string, JSONValue>; questions: Record<string, Question>; signal?: AbortSignal }) => Promise<{ model: string; answers: Record<string, Answer> }>;
export function validatePack(pack: unknown): Pack;
export function validateAnswers(questions: Record<string, Question>, answers: unknown): void;
export function fingerprint(value: JSONValue | Pack): string;
export function questionFingerprint(pack: Pack): string;
export function decide(pack: Pack, state: Record<string, JSONValue>, answers: Record<string, Answer>): { outcome: string; ruleId: string | null };
export function createJevProvider(options?: { apiKey?: string; endpoint?: string; timeoutMs?: number; fetchImpl?: typeof fetch }): Provider;
export function evaluate(pack: Pack, state: Record<string, JSONValue>, options: { provider: Provider; signal?: AbortSignal; timeoutMs?: number; onRecord?: (record: DecisionRecord) => Promise<void> }): Promise<DecisionRecord>;
export function replay(pack: Pack, records: { record: DecisionRecord; state: Record<string, JSONValue> }[]): { id: string; before: string; after: string; ruleId: string | null; changed: boolean }[];
