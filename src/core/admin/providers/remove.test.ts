import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { logger } from '@/core/logger'

import { removeProvider } from './commands'
import { runProviderAction } from './run'

// The delete command (ARCHITECTURE §3.3) against a fake client: what it refuses before SQL, how
// SQL refusals map to reasons, and what it logs. The real function is covered in tests/db.

const ID = '6f1c2f9e-6a52-4c39-9a51-0a9f6b0c1d2e'
const ADMIN = '0b9c2f9e-6a52-4c39-9a51-0a9f6b0c1d2f'

const row = (isActive: boolean) => ({
  id: ID,
  module: 'image',
  adapter: 'openai_images',
  label: 'Old relay',
  base_url: 'https://relay.example.com/v1',
  model: 'gpt-image-2.6',
  api_key_last4: 'abcd',
  is_active: isActive,
  notes: null,
  updated_at: '2026-11-06T00:00:00Z',
  price_input_text_per_m: null,
  price_input_image_per_m: null,
  price_output_per_m: null,
})

function fakeDb(found: ReturnType<typeof row> | null, rpcError: string | null = null) {
  const rpc = vi.fn(async () => ({ data: null, error: rpcError ? { message: rpcError } : null }))
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: found, error: null }) }
  const db = { from: () => query, rpc } as unknown as SupabaseClient
  return { db, rpc }
}

const remove = (db: SupabaseClient, input: unknown = { id: ID }) => runProviderAction(() => removeProvider({ db }, ADMIN, input))

describe('removeProvider', () => {
  it('deletes an inactive row through admin_delete_provider and logs who, which and what model', async () => {
    const info = vi.spyOn(logger, 'info')
    const { db, rpc } = fakeDb(row(false))
    expect(await remove(db)).toEqual({ ok: true, value: undefined })
    expect(rpc).toHaveBeenCalledWith('admin_delete_provider', { p_id: ID })
    expect(info).toHaveBeenCalledWith('admin.provider.deleted', { adminId: ADMIN, providerId: ID, module: 'image', model: 'gpt-image-2.6' })
    info.mockRestore()
  })

  it('refuses the active row without calling SQL', async () => {
    const { db, rpc } = fakeDb(row(true))
    expect(await remove(db)).toEqual({ ok: false, reason: 'provider_active' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps SQL refusals: switched on meanwhile, or already gone', async () => {
    expect(await remove(fakeDb(row(false), 'PROVIDER_ACTIVE').db)).toEqual({ ok: false, reason: 'provider_active' })
    expect(await remove(fakeDb(row(false), 'PROVIDER_NOT_FOUND').db)).toEqual({ ok: false, reason: 'not_found' })
    expect(await remove(fakeDb(null).db)).toEqual({ ok: false, reason: 'not_found' })
  })

  it('refuses a malformed id before reading anything', async () => {
    const { db, rpc } = fakeDb(row(false))
    expect(await remove(db, { id: 'not-a-uuid' })).toEqual({ ok: false, reason: 'invalid_input' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
