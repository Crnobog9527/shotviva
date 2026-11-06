import type { DecidedScope } from '@/core/templates'

// The decision step of a photo edit (ARCHITECTURE §5.2): one predicate question per range, asked
// about the source photo and the user's own words. Adapters implement ScopeDecider; the
// question texts come from the `edit` template and are never logged.

export type ScopeQuestion = { scope: DecidedScope; text: string }

export type DecisionInput = {
  // A small JPEG data URL of the source work; sent at low detail.
  imageDataUrl: string
  // What the user typed, unchanged and untranslated.
  instruction: string
  questions: ScopeQuestion[]
  signal: AbortSignal
}

// Probability per range; null when the model declined to answer that question.
export type ScopeProbabilities = Record<DecidedScope, number | null>

export type ScopeDecider = {
  // `<ai_providers.id>/<model>`, like generation_jobs.provider.
  tag: string
  decide(input: DecisionInput): Promise<ScopeProbabilities>
}
