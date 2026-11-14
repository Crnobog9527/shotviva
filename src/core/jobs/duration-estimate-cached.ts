import 'server-only'

import { cacheLife } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import { logger } from '../logger'
import type { Resolution } from '../templates'
import { loadDurationEstimate } from './duration-estimate'
import type { DurationEstimate } from './duration-summary'

// One read per template and size every quarter of an hour, whoever asks: the numbers are the
// same for every account and move slowly. A failed read is "no estimate" (the generic words),
// cached briefly so the next wait screen tries again.
export async function cachedDurationEstimate(templateId: string, resolution: Resolution): Promise<DurationEstimate | null> {
  'use cache'
  try {
    const estimate = await loadDurationEstimate(createAdminSupabase(), templateId, resolution)
    cacheLife({ revalidate: 900, expire: 3600 })
    return estimate
  } catch (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('generate.estimate.failed', { templateId, error })
    return null
  }
}
