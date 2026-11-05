import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { ProviderSettingError } from './setting-error'

// Provider API keys live in Supabase Vault (ARCHITECTURE §3.3, T17b); ai_providers keeps only
// vault_secret_id and the last four characters. Both calls are service-role-only SQL functions.
// The plaintext is read per request for generation or a connection test and never cached.

// Same rule as admin_set_provider_key: printable ASCII, no whitespace, 16–1024 characters.
export const apiKeySchema = z.string().regex(/^[!-~]{16,1024}$/)

type RpcError = { message: string } | null

function mapError(what: string, id: string, error: RpcError): void {
  if (!error) return
  if (error.message.includes('PROVIDER_NOT_FOUND')) throw new ProviderSettingError('not_found', `provider ${id} not found`)
  if (error.message.includes('PROVIDER_KEY_INVALID')) throw new ProviderSettingError('api_key_invalid', 'API key format is invalid')
  if (error.message.includes('PROVIDER_KEY_MISSING')) {
    throw new ProviderSettingError('api_key_missing', `provider ${id} has a key id but no Vault entry`)
  }
  throw new AppError('INTERNAL', `${what} failed`, { cause: new Error(error.message) })
}

// Stores, replaces or (null) clears the row's key. The key never comes back.
export async function setProviderKey(db: SupabaseClient, id: string, apiKey: string | null): Promise<void> {
  const { error } = await db.rpc('admin_set_provider_key', { p_id: id, p_key: apiKey })
  mapError('admin_set_provider_key', id, error)
}

// The plaintext key, or null when the row has none.
export async function readProviderKey(db: SupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await db.rpc('provider_api_key', { p_id: id })
  mapError('provider_api_key', id, error)
  return z.string().min(1).nullable().parse(data ?? null)
}
