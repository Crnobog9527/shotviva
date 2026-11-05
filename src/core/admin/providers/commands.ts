import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

import type { ServerEnv } from '@/core/env'
import { logger } from '@/core/logger'
import {
  activateProvider,
  assertPublicBaseUrl,
  decryptSecret,
  encryptSecret,
  findProvider,
  findProviderSecret,
  insertProvider,
  lastFour,
  listProviders,
  parseSecretsKey,
  ProviderSettingError,
  testConnection,
  updateProvider,
  type ConnectionResult,
  type HostResolver,
} from '@/core/providers'

import { providerIdSchema, saveProviderSchema } from './schema'

// Business rules for /admin/providers. Callers pass a service-role client and the admin's id
// after requireAdmin(). Keys go in encrypted and never come back out of this file in plaintext.

export type ProviderCommandDeps = {
  db: SupabaseClient
  env: ServerEnv
  resolveHost?: HostResolver
  fetch?: typeof fetch
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const detail = result.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.code}`).join('; ')
  throw new ProviderSettingError('invalid_input', detail)
}

function encryptKey(apiKey: string | undefined, env: ServerEnv) {
  if (!apiKey) return undefined
  return { ciphertext: encryptSecret(apiKey, parseSecretsKey(env.PROVIDER_SECRETS_KEY)), last4: lastFour(apiKey) }
}

// Insert or update. A new row needs a key; an edit with a blank key keeps the stored one.
export async function saveProvider(deps: ProviderCommandDeps, adminId: string, input: unknown): Promise<string> {
  const parsed = parseOrThrow(saveProviderSchema, input)
  const baseUrl = await assertPublicBaseUrl(parsed.baseUrl, deps.resolveHost)
  const key = encryptKey(parsed.apiKey, deps.env)
  const write = {
    module: parsed.module,
    adapter: parsed.adapter,
    label: parsed.label,
    baseUrl,
    model: parsed.model,
    notes: parsed.notes ?? null,
    updatedBy: adminId,
    key,
  }
  let id = parsed.id
  if (id) {
    await updateProvider(deps.db, id, write)
  } else {
    if (!key) throw new ProviderSettingError('api_key_required', 'a new provider needs an API key')
    id = await insertProvider(deps.db, { ...write, key })
  }
  logger.info('admin.provider.saved', { adminId, providerId: id, isNew: !parsed.id, keyChanged: Boolean(key) })
  return id
}

// Makes one row the module's provider; the SQL function switches in one transaction.
export async function activate(deps: ProviderCommandDeps, adminId: string, input: unknown): Promise<void> {
  const { id } = parseOrThrow(providerIdSchema, input)
  const target = await findProvider(deps.db, id)
  if (!target) throw new ProviderSettingError('not_found', `provider ${id} not found`)
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
  const row = await findProviderSecret(deps.db, id)
  const apiKey = decryptSecret(row.apiKeyCiphertext, parseSecretsKey(deps.env.PROVIDER_SECRETS_KEY))
  const baseUrl = await assertPublicBaseUrl(row.baseUrl, deps.resolveHost)
  const result = await testConnection({ baseUrl, apiKey }, deps.fetch)
  logger.info('admin.provider.tested', { providerId: id, ok: result.ok, status: result.status ?? null })
  return result
}
