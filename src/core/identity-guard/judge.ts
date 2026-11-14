import type { ProviderPrices } from '../jobs/provider'

// The text-only decision call of ARCHITECTURE §5.1a. Adapters live with the decision provider's
// other adapter (modules/image) and are picked by the active 'decision' row, so core never knows
// which model answers. Only the user's words are sent: no photo, no template prompt.

export const IDENTITY_ENTRIES = ['workspace', 'edit', 'partner'] as const
export type IdentityEntry = (typeof IDENTITY_ENTRIES)[number]

// Refusals come from the decision model only. 'keyword' remains for rows written while a keyword
// list existed (#300–#314); identity_refusals still accepts both.
export const REFUSAL_METHODS = ['keyword', 'model'] as const
export type RefusalMethod = (typeof REFUSAL_METHODS)[number]

export type IdentityJudgeUsage = { inputTokens: number; outputTokens: number }

export type IdentityJudgeAnswer = { identitySwap: boolean; usage: IdentityJudgeUsage | null }

export type IdentityJudge = {
  // `<ai_providers.id>/<model>`, like generation_jobs.provider.
  tag: string
  // The decision row's per-million prices, to cost the step with the job (T33).
  prices?: ProviderPrices | null
  judge(input: { text: string; instructions: string; signal: AbortSignal }): Promise<IdentityJudgeAnswer>
}
