import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { createMemoryStore } from '../../tests/fakes/memory-store'
import { mirrorDishware, type MirrorItem } from './mirror'

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const item = (n: number, bytes: Uint8Array, isActive = true): MirrorItem => ({
  id: id(n), label: `v${n}`, category: 'long', shape: 'platter', imageKey: `dishware/${id(n)}-0123456789abcdef.webp`,
  width: 4, height: 3, isActive, bytes: async () => bytes,
})

function fakeDb(error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: { previous_key: null }, error }))
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}

describe('vessel library mirror (§5.1c)', () => {
  it('writes new images once, saves every row and switches off rows the source no longer has', async () => {
    const r2 = createMemoryStore()
    const { db, rpc } = fakeDb()
    const items = [item(1, Uint8Array.of(1)), item(2, Uint8Array.of(2))]
    const current = [item(3, Uint8Array.of(3)), item(4, Uint8Array.of(4), false)]
    const lines: string[] = []
    const first = await mirrorDishware({ db, store: r2.store, actorId: id(9), current }, items, (line) => lines.push(line))
    expect(first).toEqual({ written: 2, saved: 2, deactivated: 1 })
    expect(rpc).toHaveBeenLastCalledWith('admin_save_dishware', { p_item: expect.objectContaining({ id: id(3), is_active: false }), p_actor: id(9) })
    const again = await mirrorDishware({ db, store: r2.store, actorId: id(9), current: [] }, items, () => {})
    expect(again.written).toBe(0)
  })

  it('never overwrites a key holding other bytes, and stops on a refused save', async () => {
    const r2 = createMemoryStore()
    r2.upload(item(1, Uint8Array.of(1)).imageKey, Uint8Array.of(9), 'image/webp')
    const { db } = fakeDb()
    await expect(mirrorDishware({ db, store: r2.store, actorId: id(9), current: [] }, [item(1, Uint8Array.of(1))], () => {})).rejects.toThrow('DISHWARE_CONFLICT')
    const refused = fakeDb({ message: 'NOT_ADMIN' })
    await expect(mirrorDishware({ db: refused.db, store: createMemoryStore().store, actorId: id(9), current: [] }, [item(1, Uint8Array.of(1))], () => {}))
      .rejects.toThrow('NOT_ADMIN')
  })
})
