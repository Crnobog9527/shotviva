import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { estimatedImageCostsSchema, imageCapabilitiesSchema } from '@/core/templates/image-capabilities'
import { creditsCostSchema, TEMPLATE_QUALITIES } from '@/core/templates/pricing'
import { RESOLUTIONS } from '@/core/templates/output-options'
import { imageCostBudget, modelCreditFloor, UNPRICED, type ProviderFloors } from '@/core/templates/provider-pricing'
import type { ImageProviderOption } from '../image-provider-field'

const rowSchema = z.object({
  provider_id: z.uuid().nullable(), label: z.string(), model: z.string(), adapter: z.enum(['openai_images', 'openrouter_images']),
  is_active: z.boolean(), capabilities: z.unknown(), resolutions: z.array(z.enum(RESOLUTIONS)),
  approved: z.record(z.string(), z.object({ quality: z.enum(TEMPLATE_QUALITIES), costs: creditsCostSchema })),
  estimated_image_costs: estimatedImageCostsSchema,
  p95: z.partialRecord(z.enum(RESOLUTIONS), z.number().nonnegative()),
})

export async function listImageProviderOptions(client: SupabaseClient, envModel: string): Promise<ImageProviderOption[]> {
  const { data, error } = await client.rpc('admin_image_pricing_catalog', { p_env_model: envModel })
  if (error) throw new AppError('INTERNAL', '无法读取出图成本，请刷新后重试')
  const catalog = z.object({ version: z.enum(['v1', 'v2']), unit_price: z.coerce.number().positive(), providers: z.array(rowSchema) }).parse(data)
  const budget = imageCostBudget(catalog.unit_price)
  return catalog.providers.map(row => {
    const caps = imageCapabilitiesSchema.safeParse(row.capabilities)
    const openAI = row.adapter === 'openai_images'
    const floor = modelCreditFloor({ openAI, resolutions: row.resolutions, estimates: row.estimated_image_costs, p95: row.p95 }, budget)
    return {
      approved: row.approved, version: catalog.version,
      id: row.provider_id ?? 'env', label: row.label, model: row.model, isActive: row.is_active,
      capabilities: caps.success ? caps.data : null, openAI, floor: openAI || caps.success ? floor : UNPRICED,
    }
  })
}

export function pricingFromOptions(options: readonly ImageProviderOption[]): ProviderFloors {
  const active = options.find(p => p.isActive)
  return {
    ...(active?.floor ?? UNPRICED),
    version: active?.version, activeProvider: active?.id,
    approvals: Object.fromEntries(options.map(p => [p.id, p.approved ?? {}])),
    providers: Object.fromEntries(options.map(p => [p.id, p.floor])),
    models: Object.fromEntries(options.map(p => [p.id, p.model])),
  }
}
