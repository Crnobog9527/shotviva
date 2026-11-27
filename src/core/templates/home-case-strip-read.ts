import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../logger'
import { toHomeCaseStrip, type CaseStripRow, type HomeCaseStrip } from './home-case-strip'

// A database without the table yet (before migration 2006): nothing set.
const MISSING = new Set(['42P01', 'PGRST205'])

// Both languages' 「更多真实案例」 (migration 2006): at most 8 rows each, one read. A database
// without the table gives an empty strip; any other failure throws, so the caller decides.
export async function readHomeCaseStrip(db: SupabaseClient): Promise<HomeCaseStrip> {
  const { data, error } = await db.from('home_case_strip').select('locale,rank,template_id,bundle_id')
    .order('locale').order('rank').limit(100).returns<CaseStripRow[]>()
  if (error && MISSING.has(error.code)) {
    logger.warn('templates.case_strip_missing', { code: error.code })
    return {}
  }
  if (error) throw new Error(`home case strip read: ${error.message}`)
  return toHomeCaseStrip(data ?? [])
}
