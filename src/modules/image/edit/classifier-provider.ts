import 'server-only'

import type { IdentityJudge } from '@/core/identity-guard'
import { logger } from '@/core/logger'
import { activeCredentials, type ProviderAdapterId, type ProviderConfig } from '@/core/providers'

import type { ScopeClassifier } from './classifier'
import { createOpenAIIdentityJudge } from './openai-identity-judge'
import { createOpenAIResponsesClassifier } from './openai-responses'

// Classifier adapters by the id a 'decision' row names (ARCHITECTURE §3.3). Another model (e.g.
// Claude Haiku) is one more entry here plus a row in /admin/providers; the edit path is unchanged.
export const CLASSIFIER_ADAPTERS: Partial<Record<ProviderAdapterId, (config: ProviderConfig, tag: string) => ScopeClassifier>> = {
  openai_responses: (config, tag) => createOpenAIResponsesClassifier(config, tag),
}

// The active 'decision' row, or null: with none switched on (or one that cannot be built) every
// edit uses the fallback paragraph rather than failing.
export async function editScopeClassifier(): Promise<ScopeClassifier | null> {
  try {
    const credentials = await activeCredentials('decision')
    if (!credentials) return null
    const build = CLASSIFIER_ADAPTERS[credentials.adapter]
    if (!build) throw new Error(`adapter ${credentials.adapter} is not a classifier`)
    return { ...build(credentials.config, credentials.tag), prices: credentials.prices }
  } catch (error) {
    logger.error('edit classifier unavailable; edits use the fallback', { error })
    return null
  }
}

// The text-only face-swap judge (ARCHITECTURE §5.1a) on the same 'decision' row.
export const IDENTITY_JUDGE_ADAPTERS: Partial<Record<ProviderAdapterId, (config: ProviderConfig, tag: string) => IdentityJudge>> = {
  openai_responses: (config, tag) => createOpenAIIdentityJudge(config, tag),
}

// Null when no decision row is switched on or it cannot be built: generation then goes ahead
// with the user's words unscreened (fail open) rather than failing.
export async function identityJudge(): Promise<IdentityJudge | null> {
  try {
    const credentials = await activeCredentials('decision')
    if (!credentials) return null
    const build = IDENTITY_JUDGE_ADAPTERS[credentials.adapter]
    if (!build) throw new Error(`adapter ${credentials.adapter} is not an identity judge`)
    return { ...build(credentials.config, credentials.tag), prices: credentials.prices }
  } catch (error) {
    logger.error('identity judge unavailable; requests are not screened', { error })
    return null
  }
}
