import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { estimatedImageCostsSchema, imageCapabilitiesSchema, type ImageCapabilities } from '../templates/image-capabilities'
import { arkPriceSchema } from '../jobs/ark-prices'
import { catalogPriceSchema } from '../jobs/catalog-price'
import type { CatalogPrice, ProviderPrices } from '../jobs'
import { ProviderSettingError } from './setting-error'
import { PROVIDER_ADAPTERS, PROVIDER_MODULES, type ActiveProviderRow, type AdminProvider, type ProviderModule } from './types'
import { resolutionSchema } from '@/core/templates/db-resolution'

// Data access for public.ai_providers. Service-role client only: the table refuses every
// client role (ARCHITECTURE §3.3). Keys are not here: they live in Vault (keys.ts).

const PRICE_COLUMNS = 'price_input_text_per_m, price_input_image_per_m, price_output_per_m'

const capsColumns = {
  capabilities: imageCapabilitiesSchema.nullable().catch(null).optional(),
  estimated_image_costs: estimatedImageCostsSchema.optional(),
}

const BASE_LIST_COLUMNS = `id, module, adapter, label, base_url, resolutions, capabilities, estimated_image_costs, model, api_key_last4, is_active, notes, updated_at, ${PRICE_COLUMNS}`
// extra_input_image_usd arrives with migration 1440; a database without it (the test site before
// the merge) is read without the column.
const OLDER_LIST_COLUMNS = `${BASE_LIST_COLUMNS}, extra_input_image_usd, byok_list_price`
// 1566: live and admin-entered prices. A database without them is read without, one step back.
const LIVE_PRICE_COLUMNS = 'catalog_price, list_price'
const LIST_COLUMNS = `${OLDER_LIST_COLUMNS}, ${LIVE_PRICE_COLUMNS}`
const missingColumn = (error: { code?: string } | null) => error?.code === '42703'

// numeric comes back from PostgREST as a JSON number; null when not filled in.
const price = z.coerce.number().nonnegative().nullable()
const priceColumns = { price_input_text_per_m: price, price_input_image_per_m: price, price_output_per_m: price }
// A malformed snapshot is no price (the job then has none), never a reason to stop generating.
const livePriceColumns = {
  catalog_price: catalogPriceSchema.nullable().catch(null).optional(),
  list_price: arkPriceSchema.nullable().catch(null).optional(),
}

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
  resolutions: z.array(resolutionSchema),
  model: z.string(),
  api_key_last4: z.string().nullable(),
  is_active: z.boolean(),
  notes: z.string().nullable(),
  updated_at: z.string(),
  // 1440: cost of each extra input image of a slot job (USD); null when not set.
  extra_input_image_usd: z.coerce.number().nonnegative().nullable().optional(),
  byok_list_price: z.boolean().optional(),
  ...priceColumns,
  ...livePriceColumns,
  ...capsColumns,
})

const BASE_ROW_COLUMNS = `id, adapter, base_url, resolutions, capabilities, estimated_image_costs, model, ${PRICE_COLUMNS}`
const ROW_COLUMNS = `${BASE_ROW_COLUMNS}, ${LIVE_PRICE_COLUMNS}`

const rowSchema = z.object({
  id: z.uuid(),
  adapter: z.enum(PROVIDER_ADAPTERS),
  base_url: z.string(),
  resolutions: z.array(resolutionSchema),
  model: z.string(),
  ...priceColumns,
  ...livePriceColumns,
  ...capsColumns,
  // Never relax a malformed stored limit on a generation path. Only the admin reader
  // tolerates legacy/malformed snapshots so it can repair them from the catalogue.
  capabilities: z.union([imageCapabilitiesSchema, z.strictObject({}).transform(() => null)]).optional(),
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
    extraInputImageUsd: row.extra_input_image_usd ?? null,
    byokListPrice: row.byok_list_price,
    model: row.model,
    apiKeyLast4: row.api_key_last4,
    isActive: row.is_active,
    notes: row.notes,
    prices: toPrices(row),
    catalogPrice: row.catalog_price ?? null,
    listPrice: row.list_price ?? null,
    updatedAt: row.updated_at,
  }
}

function toActiveRow(row: z.infer<typeof rowSchema>): ActiveProviderRow {
  return { id: row.id, adapter: row.adapter, baseUrl: row.base_url, resolutions: row.resolutions, model: row.model,
    capabilities: row.capabilities, estimatedImageCosts: row.estimated_image_costs, prices: toPrices(row),
    catalogPrice: row.catalog_price ?? null, listPrice: row.list_price ?? null }
}

export async function listProviders(db: SupabaseClient): Promise<AdminProvider[]> {
  const list = (columns: string) => db.from('ai_providers').select(columns).order('created_at')
  let { data, error } = await list(LIST_COLUMNS)
  if (missingColumn(error)) ({ data, error } = await list(OLDER_LIST_COLUMNS))
  if (missingColumn(error)) ({ data, error } = await list(BASE_LIST_COLUMNS))
  if (error) fail('list', error)
  return z.array(listRowSchema).parse(data).map(toAdminProvider)
}

export async function findProvider(db: SupabaseClient, id: string): Promise<AdminProvider | null> {
  const one = (columns: string) => db.from('ai_providers').select(columns).eq('id', id).maybeSingle()
  let { data, error } = await one(LIST_COLUMNS)
  if (missingColumn(error)) ({ data, error } = await one(OLDER_LIST_COLUMNS))
  if (missingColumn(error)) ({ data, error } = await one(BASE_LIST_COLUMNS))
  if (error) fail('read', error)
  return data ? toAdminProvider(listRowSchema.parse(data)) : null
}

// One row's connection settings, for a connection test.
export async function findProviderRow(db: SupabaseClient, id: string): Promise<ActiveProviderRow> {
  const one = (columns: string) => db.from('ai_providers').select(columns).eq('id', id).maybeSingle()
  let { data, error } = await one(ROW_COLUMNS)
  if (missingColumn(error)) ({ data, error } = await one(BASE_ROW_COLUMNS))
  if (error) fail('read', error)
  if (!data) throw new ProviderSettingError('not_found', `provider ${id} not found`)
  return toActiveRow(rowSchema.parse(data))
}

export async function loadActiveProviderRow(db: SupabaseClient, module: ProviderModule): Promise<ActiveProviderRow | null> {
  const active = (columns: string) => db.from('ai_providers').select(columns).eq('module', module).eq('is_active', true).maybeSingle()
  let { data, error } = await active(ROW_COLUMNS)
  if (missingColumn(error)) ({ data, error } = await active(BASE_ROW_COLUMNS))
  if (error) fail('active lookup', error)
  return data ? toActiveRow(rowSchema.parse(data)) : null
}

export class CapabilityWriteConflict extends ProviderSettingError {
  constructor() { super('invalid_input', 'Provider changed during refresh') }
}

// An overlapping admin save or refresh wins over a stale catalogue response.
export async function persistRefreshedCapabilities(db: SupabaseClient, row: AdminProvider, capabilities: ImageCapabilities) {
  const { data, error } = await db.from('ai_providers')
    .update({ capabilities, resolutions: capabilities.resolutions })
    .eq('id', row.id).eq('updated_at', row.updatedAt).select('id')
  if (error) fail('refresh capabilities', error)
  if (!data?.length) throw new CapabilityWriteConflict()
}

// The catalogue price just read for this row (1566). Only while the row still runs that model on
// that endpoint, so a refresh racing an admin's model change cannot price the new model with the
// old one's rate. false: the row changed (or a database without the column), nothing written.
export async function persistCatalogPrice(db: SupabaseClient, row: Pick<AdminProvider, 'id' | 'model' | 'baseUrl'>, price: CatalogPrice): Promise<boolean> {
  const { data, error } = await db.from('ai_providers').update({ catalog_price: price })
    .eq('id', row.id).eq('model', row.model).eq('base_url', row.baseUrl).select('id')
  if (missingColumn(error)) return false
  if (error) fail('save catalogue price', error)
  return Boolean(data?.length)
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
