import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { drainReferenceDeletions } from './object-cleanup'

describe('private reference cleanup', () => {
  it('only acknowledges successfully deleted, due keys; failed ones remain for retry', async () => {
    const { store } = createMemoryStore()
    const remove = vi.spyOn(store, 'delete').mockResolvedValueOnce().mockRejectedValueOnce(new Error('R2 down'))
    const records = [{ r2_key: 'references/a.webp' }, { r2_key: 'references/b.webp' }]
    const rpc = vi.fn().mockResolvedValueOnce({ data: records }).mockResolvedValueOnce({ error: null })
    const db = { rpc } as unknown as SupabaseClient
    expect(await drainReferenceDeletions(db, 'actor', store)).toBe(1)
    expect(rpc).toHaveBeenCalledWith('admin_due_reference_deletions', { p_actor: 'actor' })
    expect(remove).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith('admin_ack_reference_deletions', { p_actor: 'actor', p_keys: ['references/a.webp'] })
  })
})
