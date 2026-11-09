import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { listImageProviderOptions, pricingFromOptions } from '@/core/admin/templates/provider-pricing'
import { serverEnv } from '@/core/env'
import { maxCostPerCredit } from '@/core/templates/provider-pricing'
import { site } from '@/site/site.config'

export function readPricingOptions(client: SupabaseClient) {
  return listImageProviderOptions(client, maxCostPerCredit(site.billing.products), serverEnv().OPENAI_IMAGE_MODEL)
}

export async function readTemplateFloors(client: SupabaseClient) {
  return pricingFromOptions(await readPricingOptions(client))
}
