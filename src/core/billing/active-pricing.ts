import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'

// The cutover writes this marker atomically with the catalogue. Never use the settings cache for a purchase.
export async function readActivePricing(admin: SupabaseClient): Promise<'v2' | undefined> {
  const { data, error } = await admin.from('system_settings').select('value').eq('key', 'pricing_catalog_version').maybeSingle()
  if (error) throw new AppError('INTERNAL', 'Active pricing could not be read')
  if (data === null) return undefined
  if (data.value === 'v2') return 'v2'
  throw new AppError('INTERNAL', 'Active pricing version is unknown')
}
