import type { ProviderPrices } from '@/core/jobs'
import type { DecidedScope } from '@/core/templates'

// The classifier step of a photo edit (ARCHITECTURE §5.2): what range the user's words change,
// and which visible elements must stay. Adapters implement ScopeClassifier and are picked by the
// active 'decision' provider's adapter (classifier-provider.ts), so the edit path never knows
// which model runs. The instructions come from the `edit` template and are never logged.

export type ClassifierInput = {
  // A small JPEG data URL of the source work; sent at low detail.
  imageDataUrl: string
  // What the user typed, unchanged and untranslated.
  instruction: string
  // The classifier's own instructions from the edit template.
  instructions: string
  signal: AbortSignal
}

export type ClassifierUsage = { inputTokens: number; outputTokens: number }

export type ClassifierAnswer = {
  scope: DecidedScope
  // 0–1, how sure the model is of `scope`.
  confidence: number
  // Up to 8 short English noun phrases of visible elements that must stay.
  keep: string[]
  // One short English line summing up the change.
  change: string
  // Whether the words ask to swap a face or turn someone into a real person (ARCHITECTURE §5.1a);
  // answered in this same call, so an edit costs no extra request.
  identitySwap: boolean
  usage: ClassifierUsage | null
}

export type ScopeClassifier = {
  // `<ai_providers.id>/<model>`, like generation_jobs.provider.
  tag: string
  // The decision row's per-million prices (T33), to cost the step; null when not known.
  prices?: ProviderPrices | null
  classify(input: ClassifierInput): Promise<ClassifierAnswer>
}
