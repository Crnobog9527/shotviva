import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { resolveOrgWorkFile } from './file'

const OWNER = '00000000-0000-4000-8000-0000000000a1'
const STAFF = '00000000-0000-4000-8000-0000000000b2'
const JOB = '11111111-1111-4111-8111-111111111111'

// The org_owner_work rpc as PostgREST answers it: the row when the owner's org made it, else none.
function db(row: { credit_pool: 'free' | 'paid' } | null): SupabaseClient {
  const rows = row ? [{ id: JOB, user_id: STAFF, output_key: `outputs/${STAFF}/${JOB}.png`, ...row }] : []
  return { rpc: async () => ({ data: rows, error: null }) } as unknown as SupabaseClient
}
const keyOf = (url: string) => url.replace(/^memory:\/\/get\//, '').replace(/\?.*$/, '')

describe('企业作品 file route', () => {
  it('signs the small copy for a list and falls back to the original when there is none', async () => {
    const { store } = createMemoryStore()
    const ask = { owner: OWNER, jobId: JOB, size: 'thumb' as const, download: false }
    expect(keyOf(await resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store }, ask))).toBe(`outputs/${STAFF}/${JOB}.png`)
    await store.put(`outputs/${STAFF}/${JOB}-thumb.webp`, new Uint8Array([1]), 'image/webp')
    expect(keyOf(await resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store }, ask))).toBe(`outputs/${STAFF}/${JOB}-thumb.webp`)
  })

  it('downloads the clean original as an attachment', async () => {
    const url = await resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store: createMemoryStore().store }, { owner: OWNER, jobId: JOB, size: 'full', download: true })
    expect(url).toContain(`download=shotviva-${JOB}.png`)
  })

  it('never signs a clean copy of a free work', async () => {
    const url = await resolveOrgWorkFile({ db: db({ credit_pool: 'free' }), store: createMemoryStore().store }, { owner: OWNER, jobId: JOB, size: 'full', download: true })
    expect(keyOf(url)).toBe(`outputs/${STAFF}/${JOB}-thumb-p1.webp`)
  })

  it('answers 404 for anything that is not a work of the owner’s org', async () => {
    await expect(resolveOrgWorkFile({ db: db(null), store: createMemoryStore().store }, { owner: OWNER, jobId: JOB, size: 'full', download: false }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store: createMemoryStore().store }, { owner: OWNER, jobId: 'not-a-uuid', size: 'full', download: false }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
