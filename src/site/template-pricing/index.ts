import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { listImageProviderOptions, pricingFromOptions, readImageProviderQuote } from '@/core/admin/templates'
import { serverEnv } from '@/core/env'
import { maxCostPerCredit } from '@/core/templates'
import { site } from '@/site/site.config'

const legacyBudget = () => maxCostPerCredit(site.billing.products)

export function readPricingOptions(client: SupabaseClient) {
  return listImageProviderOptions(client, legacyBudget(), serverEnv().OPENAI_IMAGE_MODEL)
}

export async function readTemplateQuote(client: SupabaseClient) {
  const { receipt, envModel, options } = await readImageProviderQuote(client, legacyBudget(), serverEnv().OPENAI_IMAGE_MODEL)
  return { receipt, envModel, floors: pricingFromOptions(options) }
}

export async function readTemplateFloors(client: SupabaseClient) {
  return pricingFromOptions(await readPricingOptions(client))
}
