import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

import { logger } from '@/core/logger'
import {
  activateProvider,
  assertPublicBaseUrl,
  deleteProvider,
  findProvider,
  findProviderRow,
  insertProvider,
  listProviders,
  ProviderSettingError,
  readProviderKey,
  setProviderKey,
  testConnection,
  updateProvider,
  type ConnectionResult,
  type HostResolver,
  type ProviderWrite,
} from '@/core/providers'

import { providerIdSchema, saveProviderSchema } from './schema'

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

// A new row is inserted first, then its key goes into Vault. If storing the key fails, the
// keyless row is removed again so the list never shows a provider that cannot run.
async function insertWithKey(db: SupabaseClient, write: ProviderWrite, apiKey: string): Promise<string> {
  const id = await insertProvider(db, write)
  try {
    await setProviderKey(db, id, apiKey)
  } catch (error) {
    await deleteProvider(db, id).catch(() => undefined)
    throw error
  }
  return id
}

// Insert or update. A new row needs a key; an edit with a blank key keeps the stored one.
export async function saveProvider(deps: ProviderCommandDeps, adminId: string, input: unknown): Promise<string> {
  const parsed = parseOrThrow(saveProviderSchema, input)
  const baseUrl = await assertPublicBaseUrl(parsed.baseUrl, deps.resolveHost)
  const write: ProviderWrite = {
    module: parsed.module,
    adapter: parsed.adapter,
    label: parsed.label,
    baseUrl,
    model: parsed.model,
    notes: parsed.notes ?? null,
    prices: { inputTextPerM: parsed.priceInputTextPerM, inputImagePerM: parsed.priceInputImagePerM, outputPerM: parsed.priceOutputPerM },
    updatedBy: adminId,
  }
  let id = parsed.id
  if (id) {
    await updateProvider(deps.db, id, write)
    if (parsed.apiKey) await setProviderKey(deps.db, id, parsed.apiKey)
  } else {
    if (!parsed.apiKey) throw new ProviderSettingError('api_key_required', 'a new provider needs an API key')
    id = await insertWithKey(deps.db, write, parsed.apiKey)
  }
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

// GET {base_url}/models with the row's stored key. Re-checks the host first, since DNS can
// change after the row was saved.
export async function testProvider(deps: ProviderCommandDeps, input: unknown): Promise<ConnectionResult> {
  const { id } = parseOrThrow(providerIdSchema, input)
  const row = await findProviderRow(deps.db, id)
  const apiKey = await readProviderKey(deps.db, id)
  if (!apiKey) throw new ProviderSettingError('api_key_missing', `provider ${id} has no API key`)
  const baseUrl = await assertPublicBaseUrl(row.baseUrl, deps.resolveHost)
  const result = await testConnection({ baseUrl, apiKey }, deps.fetch)
  logger.info('admin.provider.tested', { providerId: id, ok: result.ok, status: result.status ?? null })
  return result
}
