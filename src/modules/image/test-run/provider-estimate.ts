import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { GenerationProvider } from '@/core/jobs'
import { logger } from '@/core/logger'
import { findProvider } from '@/core/providers'
import type { Resolution, TemplateQuality } from '@/core/templates'

import { estimateRunUsd, providerRunEstimateUsd } from './estimate'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A trial's budget hold from the row behind the routed provider (its tag is `<row id>/<model>`):
// per image for Ark and the like, tokens for OpenAI. A provider with no row (env) or a row that
// cannot be read keeps the token estimate, which is never the lower one.
export async function testRunEstimateUsd(
  db: SupabaseClient,
  provider: Pick<GenerationProvider, 'id' | 'prices'>,
  resolution: Resolution,
  quality: TemplateQuality,
  photoCount: number,
): Promise<number> {
  const rowId = provider.id.slice(0, provider.id.indexOf('/'))
  if (!UUID.test(rowId)) return estimateRunUsd(resolution, quality, provider.prices)
  try {
    const row = await findProvider(db, rowId)
    if (!row) return estimateRunUsd(resolution, quality, provider.prices)
    return providerRunEstimateUsd(resolution, quality, { ...row, prices: provider.prices }, photoCount)
  } catch (error) {
    logger.warn('test run estimate: provider row unreadable; token estimate kept', { provider: provider.id, error })
    return estimateRunUsd(resolution, quality, provider.prices)
  }
}
