import 'server-only'

import { logger } from '@/core/logger'
import { activeCredentials, type ProviderAdapterId, type ProviderConfig } from '@/core/providers'

import type { ScopeClassifier } from './classifier'
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
    return build(credentials.config, credentials.tag)
  } catch (error) {
    logger.error('edit classifier unavailable; edits use the fallback', { error })
    return null
  }
}
