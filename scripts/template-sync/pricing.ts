import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

import { serverEnv } from '../../src/core/env'
import { CREDITS_FLOOR } from '../../src/modules/image/credits-floor'
import { site } from '../../src/site/site.config'

// T96 can land before or after T93. Use its admin calculation against the destination
// once present in the checked-out main. SQL refuses legacy floors on a T96 database.
export async function targetFloors(db: SupabaseClient) {
  const models = resolve('src/core/templates/provider-pricing.ts')
  if (!existsSync(models)) return CREDITS_FLOOR
  const { maxCostPerCredit } = await import(models)
  const pricing = resolve('src/core/admin/templates/provider-pricing.ts')
  const { listImageProviderOptions, pricingFromOptions } = await import(pricing)
  const options = await listImageProviderOptions(db, maxCostPerCredit(site.billing.products), serverEnv().OPENAI_IMAGE_MODEL)
  return pricingFromOptions(options)
}
