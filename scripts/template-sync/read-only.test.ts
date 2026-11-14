import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { readOnlySide } from './read-only'

function production() {
  const select = vi.fn(() => ({ in: vi.fn() }))
  const insert = vi.fn()
  const db = { rpc: vi.fn(async () => ({ data: 1, error: null })), from: vi.fn(() => ({ select, insert, update: vi.fn(), delete: vi.fn() })), storage: {} }
  const store = { head: vi.fn(async () => null), get: vi.fn(async () => new Uint8Array()), put: vi.fn() }
  const side = readOnlySide({ db: db as unknown as SupabaseClient, assets: { base: 'https://p.test', store }, private: { ...store } })
  return { side, db, store, select, insert }
}

describe('readOnlySide (production as the source of a reverse run)', () => {
  it('passes the sync read functions and table selects through', async () => {
    const { side, db, select } = production()
    await side.db.rpc('read_template_sync_source', { p_id: 'demo' })
    side.db.from('templates').select('id')
    expect(db.rpc).toHaveBeenCalledWith('read_template_sync_source', { p_id: 'demo' })
    expect(select).toHaveBeenCalledWith('id')
  })

  it('refuses every write function before it is sent', () => {
    const { side, db } = production()
    for (const name of ['sync_preview_template', 'sync_preview_template_state', 'admin_set_featured_templates', 'readx']) {
      expect(() => side.db.rpc(name, {})).toThrow('SOURCE_WRITE_REFUSED')
    }
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('offers no insert, update, delete, storage or auth on the client', () => {
    const { side, insert } = production()
    const table = side.db.from('templates') as unknown as Record<string, unknown>
    expect(table.insert).toBeUndefined()
    expect(table.update).toBeUndefined()
    expect(table.delete).toBeUndefined()
    expect(insert).not.toHaveBeenCalled()
    expect(() => side.db.storage).toThrow('SOURCE_WRITE_REFUSED')
    expect(() => side.db.auth).toThrow('SOURCE_WRITE_REFUSED')
  })

  it('reads covers and style references but never puts an object', async () => {
    const { side, store } = production()
    await side.assets.store.head('covers/demo/a.webp')
    await side.private?.get('style-refs/demo/a.webp')
    await expect(side.assets.store.put('covers/demo/a.webp', new Uint8Array(), 'image/webp')).rejects.toThrow('SOURCE_WRITE_REFUSED')
    await expect(side.private!.put('style-refs/demo/a.webp', new Uint8Array(), 'image/webp')).rejects.toThrow('SOURCE_WRITE_REFUSED')
    expect(store.put).not.toHaveBeenCalled()
  })
})
