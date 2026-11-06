import 'server-only'

import { logger } from '@/core/logger'
import { activeCredentials } from '@/core/providers'

import type { ScopeDecider } from './decision'
import { createOpenAIDecisions } from './openai-decisions'

// The active 'decision' row in /admin/providers, or null: with none switched on (or one that
// cannot be built) every edit uses the fallback paragraph rather than failing.
export async function editDecider(): Promise<ScopeDecider | null> {
  try {
    const credentials = await activeCredentials('decision')
    if (!credentials) return null
    if (credentials.adapter !== 'openai_decisions') throw new Error(`adapter ${credentials.adapter} cannot decide`)
    return createOpenAIDecisions(credentials.config, credentials.tag)
  } catch (error) {
    logger.error('decision provider unavailable; edits use the fallback', { error })
    return null
  }
}
