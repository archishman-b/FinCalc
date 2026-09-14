import { RulePackEnvelope } from './schema';

export * from './schema';

/**
 * Registry of shipped rule packs. Empty in Phase 0 by design: packs are added
 * in Phase 2, each figure looked up and cited at build time.
 */
const registry: readonly RulePackEnvelope[] = [];

export function listRulePacks(): readonly RulePackEnvelope[] {
  return registry;
}

export function getRulePack(fy: string): RulePackEnvelope | undefined {
  return registry.find((pack) => pack.fy === fy);
}

/** Validates an untrusted object (e.g. a JSON pack) against the envelope; throws a ZodError with the offending path. */
export function parseRulePack(input: unknown): RulePackEnvelope {
  return RulePackEnvelope.parse(input);
}
