import { RESOLUTIONS, type Resolution } from '../templates/output-options'

// Which of the site's three tiers a provider may offer (ARCHITECTURE §8.1, PR-1b). The tiers
// come from the model, never from code that assumes all three:
//   - OpenAI: the model families below. OpenAI's API does not report sizes, so the table is
//     the source. gpt-image-2 and later take any size up to 3840 px a side and 8,294,400 pixels,
//     which is the site's 4K table; gpt-image-1, 1.5 and 1-mini make fixed sizes up to 1536 px,
//     so only 1K. A snapshot such as `gpt-image-2.6-2026-10-01` counts as its family.
//   - OpenRouter: the catalogue's resolution parameter (catalogCapabilities).
//   - Ark: ARK_RESOLUTIONS.
// A model the table does not know offers 1K only until an admin declares more (audited).

const OPENAI_FAMILIES: ReadonlyArray<{ pattern: RegExp; tiers: readonly Resolution[] }> = [
  { pattern: /^gpt-image-2(\.5|\.6)?(-|$)/, tiers: ['1k', '2k', '4k'] },
  { pattern: /^gpt-image-1(\.5|-mini)?(-|$)/, tiers: ['1k'] },
]

export const UNKNOWN_MODEL_TIERS: readonly Resolution[] = ['1k']

export function openAIImageTiers(model: string): { tiers: readonly Resolution[]; known: boolean } {
  const family = OPENAI_FAMILIES.find(({ pattern }) => pattern.test(model.trim()))
  return family ? { tiers: family.tiers, known: true } : { tiers: UNKNOWN_MODEL_TIERS, known: false }
}

// Where a provider's tiers came from: a code table, its catalogue, an admin's declaration for a
// model the table does not know, or the unknown-model default.
export const TIER_SOURCES = ['spec', 'catalog', 'declared', 'unknown'] as const
export type TierSource = (typeof TIER_SOURCES)[number]

export type TierDecision = {
  resolutions: Resolution[]
  source: TierSource
  // The admin's narrower choice (or an unknown model's declaration), kept so a refresh applies it
  // again. Absent when every detected tier is on.
  limit?: Resolution[]
  // Tiers an admin turned on beyond what was detected: unknown OpenAI models only. Audited.
  declared: Resolution[]
}

const ordered = (tiers: Iterable<Resolution>) => {
  const set = new Set(tiers)
  return RESOLUTIONS.filter((tier) => set.has(tier))
}

// `detected` from the table or catalogue; `choice` from the admin form or the stored limit.
// A known model or a catalogue can only be narrowed. Only an unknown OpenAI model can go beyond
// what was detected, and only by an explicit choice. Null when nothing would be left.
export function decideTiers(detected: readonly Resolution[], source: 'spec' | 'catalog' | 'unknown', choice?: readonly Resolution[] | null): TierDecision | null {
  const base = ordered(detected)
  if (!choice) return base.length ? { resolutions: base, source, declared: [] } : null
  if (source === 'unknown') {
    const resolutions = ordered(choice)
    if (!resolutions.length) return null
    const declared = resolutions.filter((tier) => !base.includes(tier))
    const same = resolutions.length === base.length && declared.length === 0
    return { resolutions, source: declared.length ? 'declared' : 'unknown', ...(same ? {} : { limit: resolutions }), declared }
  }
  const resolutions = base.filter((tier) => choice.includes(tier))
  if (!resolutions.length) return null
  return { resolutions, source, ...(resolutions.length < base.length ? { limit: resolutions } : {}), declared: [] }
}
