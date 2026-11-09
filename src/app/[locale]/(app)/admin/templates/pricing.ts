import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { listImageProviderOptions } from '@/core/admin'
import { pricingFromOptions } from '@/core/admin/templates/provider-pricing'
import { serverEnv } from '@/core/env'

export function readPricingOptions(client: SupabaseClient) {
  return listImageProviderOptions(client, serverEnv().OPENAI_IMAGE_MODEL)
}

export async function readTemplateFloors(client: SupabaseClient) {
  return pricingFromOptions(await readPricingOptions(client))
}
