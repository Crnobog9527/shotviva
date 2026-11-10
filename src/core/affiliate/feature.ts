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

// The account page needs only the current user's status, via the affiliates primary key.
export async function hasAffiliateDashboard(userId: string): Promise<boolean> {
  const { data, error } = await createAdminSupabase().from('affiliates')
    .select('status').eq('user_id', userId).maybeSingle()
  if (error) logger.warn('affiliate membership unavailable', { code: error.code })
  return data?.status === 'active' && await isAffiliateEnabled()
}

// Only the introduction is public when operations are closed.
export function requiresAffiliateProgram(pathname: string): boolean {
  const path = pathname.toLowerCase().replace(/^\/(en|zh)(?=\/)/, '').replace(/\/$/, '')
  return (path === '/partners' || path.startsWith('/partners/')) && path !== '/partners/join'
}
