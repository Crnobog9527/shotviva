import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

import { logger } from '@/core/logger'
import {
  activateProvider,
  adminDeleteProvider,
  assertPublicBaseUrl,
  fetchImageCapabilities,
  findProvider,
  findProviderRow,
  listProviders,
  openRouterModelTiers,
  ProviderSettingError,
  readProviderKey,
  testConnection,
  type ConnectionResult,
  type HostResolver,
} from '@/core/providers'

import { lookupModelSchema, providerIdSchema, saveProviderSchema } from './schema'

// Business rules for /admin/providers. Callers pass a service-role client and the admin's id
// after requireAdmin(). Keys go straight into Vault and never come back to the browser.

export type ProviderCommandDeps = {
  db: SupabaseClient
  resolveHost?: HostResolver
  fetch?: typeof fetch
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  // Issue codes only: an invalid key must not end up in a log line.
  const detail = result.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.code}`).join('; ')
  const keyIssue = result.error.issues.some((issue) => issue.path[0] === 'apiKey')
  throw new ProviderSettingError(keyIssue ? 'api_key_invalid' : 'invalid_input', detail)
}

// Previews the same catalogue entry save validates, without ever reading a Vault key.
export async function lookupProviderModel(input: unknown) {
  const { baseUrl, model, retry } = parseOrThrow(lookupModelSchema, input)
  return fetchImageCapabilities('openrouter_images', await assertPublicBaseUrl(baseUrl), model, retry ? fetch : undefined)
}

// The slot floor's cost per extra input image (1392); undefined (an older editor) keeps it.
async function saveExtraInputCost(deps: ProviderCommandDeps, adminId: string, id: string,
  { module, extraInputImageUsd: usd }: { module: string; extraInputImageUsd?: number | null }) {
  if (module !== 'image' || usd === undefined) return
  const { error } = await deps.db.rpc('admin_set_provider_extra_input_cost', { p_actor: adminId, p_id: id, p_usd: usd })
  if (error) throw new ProviderSettingError('internal', 'Saving the extra input image cost failed')
}

// Save the confirmed catalogue snapshot and the optional Vault key in the same transaction.
export async function saveProvider(deps: ProviderCommandDeps, adminId: string, input: unknown): Promise<string> {
  const parsed = parseOrThrow(saveProviderSchema, input)
  if (!parsed.id && !parsed.apiKey) throw new ProviderSettingError('api_key_required', 'A new provider needs an API key')
  const baseUrl = await assertPublicBaseUrl(parsed.baseUrl, deps.resolveHost)
  const caps = await fetchImageCapabilities(parsed.adapter, baseUrl, parsed.model, deps.fetch ?? fetch)
  const settings = {
    module: parsed.module, adapter: parsed.adapter, label: parsed.label, base_url: baseUrl, model: parsed.model,
    notes: parsed.notes, estimated_image_costs: parsed.estimatedImageCosts, price_input_text_per_m: parsed.priceInputTextPerM,
    price_input_image_per_m: parsed.priceInputImagePerM, price_output_per_m: parsed.priceOutputPerM,
  }
  const { data, error } = await deps.db.rpc('admin_save_provider', {
    p_actor: adminId, p_id: parsed.id ?? null, p_settings: settings, p_capabilities: caps ?? {}, p_key: parsed.apiKey ?? null,
  })
  if (error?.message.includes('PROVIDER_NOT_FOUND')) throw new ProviderSettingError('not_found', 'Provider not found')
  // Vendor keys are write-only; never attach the RPC input or database error detail to logs.
  if (error) throw new ProviderSettingError('internal', 'Saving provider failed')
  const id = providerIdSchema.parse({ id: data }).id
  await saveExtraInputCost(deps, adminId, id, parsed)
  logger.info('admin.provider.saved', { adminId, providerId: id, isNew: !parsed.id, keyChanged: Boolean(parsed.apiKey) })
  return id
}

// Makes one row the module's provider; the SQL function switches in one transaction.
export async function activate(deps: ProviderCommandDeps, adminId: string, input: unknown): Promise<void> {
  const { id } = parseOrThrow(providerIdSchema, input)
  const target = await findProvider(deps.db, id)
  if (!target) throw new ProviderSettingError('not_found', `provider ${id} not found`)
  // A keyless provider would fail every generation the moment it is switched on.
  if (!target.apiKeyLast4) throw new ProviderSettingError('api_key_missing', `provider ${id} has no API key`)
  const previous = (await listProviders(deps.db)).find((p) => p.module === target.module && p.isActive)
  await activateProvider(deps.db, id)
  logger.info('admin.provider.activated', {
    adminId,
    module: target.module,
    from: previous ? { id: previous.id, model: previous.model } : 'env',
    to: { id: target.id, model: target.model },
  })
}

// Deletes a row that is not in use, with its Vault key (§3.3). The SQL function is the authority
// on "in use"; the early check only spares a round trip. Jobs keep their provider text.
export async function removeProvider(deps: ProviderCommandDeps, adminId: string, input: unknown): Promise<void> {
  const { id } = parseOrThrow(providerIdSchema, input)
  const target = await findProvider(deps.db, id)
  if (!target) throw new ProviderSettingError('not_found', `provider ${id} not found`)
  if (target.isActive) throw new ProviderSettingError('provider_active', `provider ${id} is in use`)
  await adminDeleteProvider(deps.db, id)
  logger.info('admin.provider.deleted', { adminId, providerId: id, module: target.module, model: target.model })
}

// Check the row's stored key without generating an image. Re-checks the host first, since DNS can
// change after the row was saved.
export async function testProvider(deps: ProviderCommandDeps, input: unknown): Promise<ConnectionResult> {
  const { id } = parseOrThrow(providerIdSchema, input)
  const row = await findProviderRow(deps.db, id)
  const apiKey = await readProviderKey(deps.db, id)
  if (!apiKey) throw new ProviderSettingError('api_key_missing', `provider ${id} has no API key`)
  const baseUrl = await assertPublicBaseUrl(row.baseUrl, deps.resolveHost)
  if (row.adapter === 'openrouter_images') await openRouterModelTiers(baseUrl, row.model, deps.fetch)
  const result = await testConnection({ baseUrl, apiKey, adapter: row.adapter, model: row.model }, deps.fetch)
  logger.info('admin.provider.tested', { providerId: id, adapter: row.adapter, ok: result.ok, status: result.status ?? null, ms: result.ms ?? null })
  return result
}
