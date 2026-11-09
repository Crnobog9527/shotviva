import 'server-only'

import { createAdminSupabase } from '../auth/supabase-admin'
import { logger } from '../logger'
import { affiliateDefault } from './defaults'

// The SQL triggers and the app must observe the same per-environment switch.
export async function isAffiliateEnabled(): Promise<boolean> {
  try {
    const { data, error } = await createAdminSupabase().from('affiliate_settings')
      .select('enabled').eq('singleton', true).single()
    if (!error) return data.enabled === true
    logger.warn('affiliate switch unavailable', { code: error.code })
  } catch {
    logger.warn('affiliate switch unavailable')
  }
  return affiliateDefault
}
