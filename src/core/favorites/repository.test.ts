import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { listFavoriteIdsOrEmpty, setFavorite } from './repository'

// A client whose writes answer `error`; records what was asked.
function fakeClient(error: { message: string } | null) {
  const upsert = vi.fn(async () => ({ error }))
  const eq = vi.fn()
  const del = { eq }
  eq.mockImplementation(() => (eq.mock.calls.length >= 2 ? Promise.resolve({ error }) : del))
  const from = vi.fn(() => ({ upsert, delete: () => del }))
  return { client: { from } as unknown as SupabaseClient, from, upsert, eq }
}

const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'

describe('setFavorite (ARCHITECTURE §5.1b)', () => {
  it('saves with an insert that ignores a duplicate, and removes the caller’s own row', async () => {
    const save = fakeClient(null)
    await expect(setFavorite(save.client, USER, 'pure-white', true)).resolves.toEqual({ saved: true })
    expect(save.upsert).toHaveBeenCalledWith({ user_id: USER, template_id: 'pure-white' }, { onConflict: 'user_id,template_id', ignoreDuplicates: true })

    const remove = fakeClient(null)
    await expect(setFavorite(remove.client, USER, 'pure-white', false)).resolves.toEqual({ saved: false })
    expect(remove.eq.mock.calls).toEqual([
      ['user_id', USER],
      ['template_id', 'pure-white'],
    ])
  })

  it('maps the trigger’s refusals to error codes', async () => {
    await expect(setFavorite(fakeClient({ message: 'FAVORITES_LIMIT' }).client, USER, 'a', true)).rejects.toMatchObject({ code: 'FAVORITES_LIMIT' })
    await expect(setFavorite(fakeClient({ message: 'TEMPLATE_NOT_FOUND' }).client, USER, 'a', true)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(setFavorite(fakeClient({ message: 'boom' }).client, USER, 'a', true)).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('refuses ids that are not template-shaped without asking the database', async () => {
    const bad = fakeClient(null)
    await expect(setFavorite(bad.client, USER, '../x', true)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(setFavorite(bad.client, USER, 'a'.repeat(65), true)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(bad.from).not.toHaveBeenCalled()
  })
})

describe('listFavoriteIdsOrEmpty', () => {
  // A read chain whose every step returns itself and ends in `answer`.
  function readClient(answer: unknown) {
    const chain: Record<string, unknown> = {}
    for (const step of ['select', 'eq', 'contains', 'order', 'limit']) chain[step] = () => chain
    chain.returns = () => Promise.resolve(answer)
    return { from: () => chain } as unknown as SupabaseClient
  }

  it('returns the ids, or [] when the read fails (pages never break on it)', async () => {
    await expect(listFavoriteIdsOrEmpty(readClient({ data: [{ template_id: 'a' }], error: null }), USER)).resolves.toEqual(['a'])
    await expect(listFavoriteIdsOrEmpty(readClient({ data: null, error: { message: 'timeout' } }), USER)).resolves.toEqual([])
  })
})
