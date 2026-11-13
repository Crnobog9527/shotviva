import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import {
  creditsCostSchema, estimatedImageCostsSchema, imageCapabilitiesSchema, imageCostBudget, modelCreditFloor,
  RESOLUTIONS, TEMPLATE_QUALITIES, UNPRICED, type ProviderFloors,
} from '@/core/templates'
import type { ImageProviderOption } from '../image-provider-field'

const tariffs = z.record(z.string(), z.object({ quality: z.enum(TEMPLATE_QUALITIES), costs: creditsCostSchema, style_sale_approved: z.boolean().optional() }))
const fallbackTiers = z.record(z.enum(RESOLUTIONS), z.number().int().positive().nullable())
const rowSchema = z.object({
  provider_id: z.uuid().nullable(), label: z.string(), model: z.string(), adapter: z.enum(['openai_images', 'openrouter_images', 'ark_images']),
  is_active: z.boolean(), capabilities: z.unknown(), resolutions: z.array(z.enum(RESOLUTIONS)),
  approved: tariffs.optional(), fallback_floors: z.record(z.enum(TEMPLATE_QUALITIES), fallbackTiers).optional(),
  estimated_image_costs: estimatedImageCostsSchema,
  p95: z.partialRecord(z.enum(RESOLUTIONS), z.number().nonnegative()),
  p95_by_quality: z.partialRecord(z.enum(TEMPLATE_QUALITIES), z.partialRecord(z.enum(RESOLUTIONS), z.number().nonnegative())).optional(),
})

const receiptSchema = z.object({
  terms: z.string(), routes: z.record(z.string(), z.string()), active: z.string(),
})
const quoteSchema = z.object({ input: z.unknown(), receipt: receiptSchema })
const catalogSchema = z.object({
  version: z.enum(['v1', 'v2']), tariffs: tariffs.optional(), unit_price: z.coerce.number().positive(), providers: z.array(rowSchema.required({ approved: true })),
})

function optionsFromInput(input: unknown, legacyBudget?: number): ImageProviderOption[] {
  const catalog = Array.isArray(input) ? null : catalogSchema.parse(input)
  const budget = catalog ? imageCostBudget(catalog.unit_price) : legacyBudget
  if (budget === undefined) throw new AppError('INTERNAL', '旧目录缺少积分成本')
  const rows = catalog?.providers ?? z.array(rowSchema).parse(input)
  return rows.map(row => {
    const caps = imageCapabilitiesSchema.safeParse(row.capabilities)
    const openAI = row.adapter === 'openai_images'
    const estimates = { ...caps.data?.catalogImageCosts, ...row.estimated_image_costs }
    const resolutions = openAI ? row.resolutions : row.resolutions.filter(tier => caps.data?.resolutions.includes(tier))
    const floor = modelCreditFloor({ openAI, resolutions, estimates, p95: row.p95, p95ByQuality: row.p95_by_quality }, budget)
    return {
      fallbackFloors: row.fallback_floors, approved: row.approved, version: catalog?.version, tariffs: row.is_active ? catalog?.tariffs : undefined,
      id: row.provider_id ?? 'env', label: row.label, model: row.model, isActive: row.is_active, fixedCapabilities: row.adapter !== 'openrouter_images',
      capabilities: caps.success ? caps.data : null, openAI, floor: openAI || caps.success ? floor : UNPRICED,
    }
  })
}

function pricingUnavailable(): never {
  throw new AppError('INTERNAL', '无法读取出图成本，请刷新后重试')
}

export async function readImageProviderQuote(client: SupabaseClient, legacyBudget: number, envModel: string) {
  const { data, error } = await client.rpc('template_sync_pricing_input', { p_env_model: envModel })
  if (error) pricingUnavailable()
  const { input, receipt } = quoteSchema.parse(data)
  return { envModel, receipt, options: optionsFromInput(input, legacyBudget) }
}

// Both editor ABIs remain valid across the catalogue rollout. Only a missing catalogue RPC
// permits the pre-cutover lookup; malformed or failed price reads cannot fall back to v1.
export async function listImageProviderOptions(client: SupabaseClient, budget: number, envModel: string): Promise<ImageProviderOption[]>
export async function listImageProviderOptions(client: SupabaseClient, envModel: string): Promise<ImageProviderOption[]>
export async function listImageProviderOptions(client: SupabaseClient, budgetOrModel: number | string, legacyModel?: string) {
  const envModel = typeof budgetOrModel === 'string' ? budgetOrModel : legacyModel
  const args = { p_env_model: envModel }
  if (typeof budgetOrModel === 'number') {
    const quote = await client.rpc('template_sync_pricing_input', args)
    if (!quote.error) return optionsFromInput(quoteSchema.parse(quote.data).input, budgetOrModel)
    if (quote.error.code !== 'PGRST202') pricingUnavailable()
  }
  const catalog = await client.rpc('admin_image_pricing_catalog', args)
  if (!catalog.error) return optionsFromInput(catalog.data)
  if (catalog.error.code !== 'PGRST202' || typeof budgetOrModel !== 'number') pricingUnavailable()
  const legacy = await client.rpc('admin_image_provider_pricing', args)
  if (legacy.error) pricingUnavailable()
  return optionsFromInput(legacy.data, budgetOrModel)
}

export function pricingFromOptions(options: readonly ImageProviderOption[]): ProviderFloors {
  const active = options.find(p => p.isActive)
  const details = active && { version: active.version, activeProvider: active.id, tariffs: active.tariffs }
  return {
    ...(active?.floor ?? UNPRICED),
    ...details,
    approvals: Object.fromEntries(options.map(p => [p.id, p.approved ?? {}])),
    providers: Object.fromEntries(options.map(p => [p.id, p.floor])),
    models: Object.fromEntries(options.map(p => [p.id, p.model])),
  }
}
