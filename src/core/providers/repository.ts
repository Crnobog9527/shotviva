import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { ProviderSettingError } from './setting-error'
import { PROVIDER_ADAPTERS, PROVIDER_MODULES, type ActiveProviderRow, type AdminProvider, type ProviderModule } from './types'

// Data access for public.ai_providers. Service-role client only: the table refuses every
// client role (ARCHITECTURE §3.3). Keys are not here: they live in Vault (keys.ts).

const LIST_COLUMNS = 'id, module, adapter, label, base_url, model, api_key_last4, is_active, notes, updated_at'

const listRowSchema = z.object({
  id: z.uuid(),
  module: z.enum(PROVIDER_MODULES),
  adapter: z.enum(PROVIDER_ADAPTERS),
  label: z.string(),
  base_url: z.string(),
  model: z.string(),
  api_key_last4: z.string().nullable(),
  is_active: z.boolean(),
  notes: z.string().nullable(),
  updated_at: z.string(),
})

const ROW_COLUMNS = 'id, adapter, base_url, model'

const rowSchema = z.object({
  id: z.uuid(),
  adapter: z.enum(PROVIDER_ADAPTERS),
  base_url: z.string(),
  model: z.string(),
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
    model: row.model,
    apiKeyLast4: row.api_key_last4,
    isActive: row.is_active,
    notes: row.notes,
    updatedAt: row.updated_at,
  }
}

function toActiveRow(row: z.infer<typeof rowSchema>): ActiveProviderRow {
  return { id: row.id, adapter: row.adapter, baseUrl: row.base_url, model: row.model }
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

export type ProviderWrite = {
  module: ProviderModule
  adapter: (typeof PROVIDER_ADAPTERS)[number]
  label: string
  baseUrl: string
  model: string
  notes: string | null
  updatedBy: string
}

function toColumns(write: ProviderWrite) {
  return {
    module: write.module,
    adapter: write.adapter,
    label: write.label,
    base_url: write.baseUrl,
    model: write.model,
    notes: write.notes,
    updated_by: write.updatedBy,
  }
}

// New rows start inactive and keyless; the caller sets the key next (keys.ts). Switching is
// admin_activate_provider's job alone.
export async function insertProvider(db: SupabaseClient, write: ProviderWrite): Promise<string> {
  const { data, error } = await db.from('ai_providers').insert({ ...toColumns(write), is_active: false }).select('id').single()
  if (error) fail('insert', error)
  return z.object({ id: z.uuid() }).parse(data).id
}

export async function updateProvider(db: SupabaseClient, id: string, write: ProviderWrite): Promise<void> {
  const { data, error } = await db.from('ai_providers').update(toColumns(write)).eq('id', id).select('id')
  if (error) fail('update', error)
  if (!data || data.length === 0) throw new ProviderSettingError('not_found', `provider ${id} not found`)
}

// Deleting also deletes the row's Vault secret (trigger in the same transaction).
export async function deleteProvider(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('ai_providers').delete().eq('id', id)
  if (error) fail('delete', error)
}

export async function activateProvider(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.rpc('admin_activate_provider', { p_id: id })
  if (error?.message.includes('PROVIDER_NOT_FOUND')) throw new ProviderSettingError('not_found', `provider ${id} not found`)
  if (error) fail('activate', error)
}
