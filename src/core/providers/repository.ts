import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { RESOLUTIONS } from '../templates/output-options'
import { AppError } from '../errors'
import { estimatedImageCostsSchema, imageCapabilitiesSchema, type ImageCapabilities } from '../templates/image-capabilities'
import type { ProviderPrices } from '../jobs'
import { ProviderSettingError } from './setting-error'
import { PROVIDER_ADAPTERS, PROVIDER_MODULES, type ActiveProviderRow, type AdminProvider, type ProviderModule } from './types'

// Data access for public.ai_providers. Service-role client only: the table refuses every
// client role (ARCHITECTURE §3.3). Keys are not here: they live in Vault (keys.ts).

const PRICE_COLUMNS = 'price_input_text_per_m, price_input_image_per_m, price_output_per_m'

const capsColumns = {
  capabilities: z.union([imageCapabilitiesSchema, z.strictObject({}).transform(() => null)]).optional(),
  estimated_image_costs: estimatedImageCostsSchema.optional(),
}

const LIST_COLUMNS = `id, module, adapter, label, base_url, resolutions, capabilities, estimated_image_costs, model, api_key_last4, is_active, notes, updated_at, ${PRICE_COLUMNS}`

// numeric comes back from PostgREST as a JSON number; null when not filled in.
const price = z.coerce.number().nonnegative().nullable()
const priceColumns = { price_input_text_per_m: price, price_input_image_per_m: price, price_output_per_m: price }

type PriceRow = { price_input_text_per_m: number | null; price_input_image_per_m: number | null; price_output_per_m: number | null }

function toPrices(row: PriceRow): ProviderPrices {
  return { inputTextPerM: row.price_input_text_per_m, inputImagePerM: row.price_input_image_per_m, outputPerM: row.price_output_per_m }
}

const listRowSchema = z.object({
  id: z.uuid(),
  module: z.enum(PROVIDER_MODULES),
  adapter: z.enum(PROVIDER_ADAPTERS),
  label: z.string(),
  base_url: z.string(),
  resolutions: z.array(z.enum(RESOLUTIONS)),
  model: z.string(),
  api_key_last4: z.string().nullable(),
  is_active: z.boolean(),
  notes: z.string().nullable(),
  updated_at: z.string(),
  ...priceColumns,
  ...capsColumns,
})

const ROW_COLUMNS = `id, adapter, base_url, resolutions, capabilities, estimated_image_costs, model, ${PRICE_COLUMNS}`

const rowSchema = z.object({
  id: z.uuid(),
  adapter: z.enum(PROVIDER_ADAPTERS),
  base_url: z.string(),
  resolutions: z.array(z.enum(RESOLUTIONS)),
  model: z.string(),
  ...priceColumns,
  ...capsColumns,
})

function fail(what: string, error: { message: string }): never {
  throw new AppError('INTERNAL', `ai_providers ${what} failed`, { cause: new Error(error.message) })
}

function toAdminProvider(row: z.infer<typeof listRowSchema>): AdminProvider {
  return {
    id: row.id,
    module: row.module,
    adapter: row.adapter,
    label: row.label,
    baseUrl: row.base_url,
    resolutions: row.resolutions,
    capabilities: row.capabilities,
    estimatedImageCosts: row.estimated_image_costs,
    model: row.model,
    apiKeyLast4: row.api_key_last4,
    isActive: row.is_active,
    notes: row.notes,
    prices: toPrices(row),
    updatedAt: row.updated_at,
  }
}

function toActiveRow(row: z.infer<typeof rowSchema>): ActiveProviderRow {
  return { id: row.id, adapter: row.adapter, baseUrl: row.base_url, resolutions: row.resolutions, model: row.model,
    capabilities: row.capabilities, estimatedImageCosts: row.estimated_image_costs, prices: toPrices(row) }
}

export async function listProviders(db: SupabaseClient): Promise<AdminProvider[]> {
  const { data, error } = await db.from('ai_providers').select(LIST_COLUMNS).order('created_at')
  if (error) fail('list', error)
  return z.array(listRowSchema).parse(data).map(toAdminProvider)
}

export async function findProvider(db: SupabaseClient, id: string): Promise<AdminProvider | null> {
  const { data, error } = await db.from('ai_providers').select(LIST_COLUMNS).eq('id', id).maybeSingle()
  if (error) fail('read', error)
  return data ? toAdminProvider(listRowSchema.parse(data)) : null
}

// One row's connection settings, for a connection test.
export async function findProviderRow(db: SupabaseClient, id: string): Promise<ActiveProviderRow> {
  const { data, error } = await db.from('ai_providers').select(ROW_COLUMNS).eq('id', id).maybeSingle()
  if (error) fail('read', error)
  if (!data) throw new ProviderSettingError('not_found', `provider ${id} not found`)
  return toActiveRow(rowSchema.parse(data))
}

export async function loadActiveProviderRow(db: SupabaseClient, module: ProviderModule): Promise<ActiveProviderRow | null> {
  const { data, error } = await db
    .from('ai_providers')
    .select(ROW_COLUMNS)
    .eq('module', module)
    .eq('is_active', true)
    .maybeSingle()
  if (error) fail('active lookup', error)
  return data ? toActiveRow(rowSchema.parse(data)) : null
}

// An overlapping admin save or refresh wins over a stale catalogue response.
export async function persistRefreshedCapabilities(db: SupabaseClient, row: AdminProvider, capabilities: ImageCapabilities) {
  const { data, error } = await db.from('ai_providers')
    .update({ capabilities, resolutions: capabilities.resolutions })
    .eq('id', row.id).eq('updated_at', row.updatedAt).select('id')
  if (error) fail('refresh capabilities', error)
  if (!data?.length) throw new ProviderSettingError('invalid_input', 'Provider changed during refresh')
}

// The admin's delete (§3.3): admin_delete_provider refuses the active row and removes the Vault
// key in the same transaction.
export async function adminDeleteProvider(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.rpc('admin_delete_provider', { p_id: id })
  if (error?.message.includes('PROVIDER_NOT_FOUND')) throw new ProviderSettingError('not_found', `provider ${id} not found`)
  if (error?.message.includes('PROVIDER_REFERENCED')) throw new ProviderSettingError('provider_referenced', 'provider is used by a template')
  if (error?.message.includes('PROVIDER_ACTIVE')) throw new ProviderSettingError('provider_active', `provider ${id} is in use`)
  if (error) fail('delete', error)
}

export async function activateProvider(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.rpc('admin_activate_provider', { p_id: id })
  if (error?.message.includes('PROVIDER_NOT_FOUND')) throw new ProviderSettingError('not_found', `provider ${id} not found`)
  if (error) fail('activate', error)
}
