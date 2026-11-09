import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { estimatedImageCostsSchema, imageCapabilitiesSchema } from '@/core/templates/image-capabilities'
import { RESOLUTIONS } from '@/core/templates/output-options'
import { modelCreditFloor, UNPRICED, type ProviderFloors } from '@/core/templates/provider-pricing'
import type { ImageProviderOption } from '../image-provider-field'

const rowSchema = z.object({
  provider_id: z.uuid().nullable(), label: z.string(), model: z.string(), adapter: z.enum(['openai_images', 'openrouter_images']),
  is_active: z.boolean(), capabilities: z.unknown(), resolutions: z.array(z.enum(RESOLUTIONS)),
  estimated_image_costs: estimatedImageCostsSchema,
  p95: z.partialRecord(z.enum(RESOLUTIONS), z.number().nonnegative()),
})

export async function listImageProviderOptions(client: SupabaseClient, budget: number, envModel: string): Promise<ImageProviderOption[]> {
  const { data, error } = await client.rpc('admin_image_provider_pricing', { p_env_model: envModel })
  if (error) throw new AppError('INTERNAL', '无法读取出图成本，请刷新后重试')
  return z.array(rowSchema).parse(data).map(row => {
    const caps = imageCapabilitiesSchema.safeParse(row.capabilities)
    const openAI = row.adapter === 'openai_images'
    const floor = modelCreditFloor({ openAI, resolutions: row.resolutions, estimates: row.estimated_image_costs, p95: row.p95 }, budget)
    return {
      id: row.provider_id ?? 'env', label: row.label, model: row.model, isActive: row.is_active,
      capabilities: caps.success ? caps.data : null, openAI, floor: openAI || caps.success ? floor : UNPRICED,
    }
  })
}

export function pricingFromOptions(options: readonly ImageProviderOption[]): ProviderFloors {
  const active = options.find(p => p.isActive)
  return {
    ...(active?.floor ?? UNPRICED),
    providers: Object.fromEntries(options.map(p => [p.id, p.floor])),
    models: Object.fromEntries(options.map(p => [p.id, p.model])),
  }
}
