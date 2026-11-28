import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { resolveOrgWorkFile, signedOrgTiles } from './file'

const OWNER = '00000000-0000-4000-8000-0000000000a1'
const STAFF = '00000000-0000-4000-8000-0000000000b2'
const JOB = '11111111-1111-4111-8111-111111111111'

// The org_owner_work rpc as PostgREST answers it: the row when the owner's org made it, else none.
function db(row: { credit_pool: 'free' | 'paid'; archive_key?: string } | null): SupabaseClient {
  const rows = row ? [{ id: JOB, user_id: STAFF, output_key: `outputs/${STAFF}/${JOB}.png`, archive_key: null, ...row }] : []
  return { rpc: async () => ({ data: rows, error: null }) } as unknown as SupabaseClient
}
const keyOf = (url: string) => url.replace(/^memory:\/\/get\//, '').replace(/\?.*$/, '')

describe('企业作品 file route', () => {
  it('signs the small copy for a list and falls back to the original when there is none', async () => {
    const { store } = createMemoryStore()
    const ask = { user: OWNER, jobId: JOB, size: 'thumb' as const, download: false }
    expect(keyOf(await resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store }, ask))).toBe(`outputs/${STAFF}/${JOB}.png`)
    await store.put(`outputs/${STAFF}/${JOB}-thumb.webp`, new Uint8Array([1]), 'image/webp')
    expect(keyOf(await resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store }, ask))).toBe(`outputs/${STAFF}/${JOB}-thumb.webp`)
  })

  it('downloads the clean original as an attachment', async () => {
    const url = await resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store: createMemoryStore().store }, { user: OWNER, jobId: JOB, size: 'full', download: true })
    expect(url).toContain(`download=shotviva-${JOB}.png`)
  })

  it('never signs a clean copy of a free work', async () => {
    const url = await resolveOrgWorkFile({ db: db({ credit_pool: 'free' }), store: createMemoryStore().store }, { user: OWNER, jobId: JOB, size: 'full', download: true })
    expect(keyOf(url)).toBe(`outputs/${STAFF}/${JOB}-thumb-p1.webp`)
  })

  it('serves an unfinished account deletion’s copy only once it exists', async () => {
    const { store } = createMemoryStore()
    const archive = `org-works/org/${JOB}.png`
    const ask = { user: OWNER, jobId: JOB, size: 'full' as const, download: false }
    expect(keyOf(await resolveOrgWorkFile({ db: db({ credit_pool: 'paid', archive_key: archive }), store }, ask))).toBe(`outputs/${STAFF}/${JOB}.png`)
    await store.put(archive, new Uint8Array([1]), 'image/png')
    expect(keyOf(await resolveOrgWorkFile({ db: db({ credit_pool: 'paid', archive_key: archive }), store }, ask))).toBe(archive)
  })

  it('answers 404 for anything that is not a work of the owner’s org', async () => {
    await expect(resolveOrgWorkFile({ db: db(null), store: createMemoryStore().store }, { user: OWNER, jobId: JOB, size: 'full', download: false }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store: createMemoryStore().store }, { user: OWNER, jobId: 'not-a-uuid', size: 'full', download: false }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  // Photos' company view (§8.3 格子图): the smaller tile, cut from the small copy when missing.
  it('signs the tile, cutting it from the small copy when there is none yet', async () => {
    const sharp = (await import('sharp')).default
    const { store } = createMemoryStore()
    const ask = { user: OWNER, jobId: JOB, size: 'tile' as const, download: false }
    // Neither copy: the original, as for a list.
    expect(keyOf(await resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store }, ask))).toBe(`outputs/${STAFF}/${JOB}.png`)
    const thumb = await sharp({ create: { width: 480, height: 600, channels: 3, background: '#888' } }).webp().toBuffer()
    await store.put(`outputs/${STAFF}/${JOB}-thumb.webp`, new Uint8Array(thumb), 'image/webp')
    expect(keyOf(await resolveOrgWorkFile({ db: db({ credit_pool: 'paid' }), store }, ask))).toBe(`outputs/${STAFF}/${JOB}-tile.webp`)
    expect(await store.head(`outputs/${STAFF}/${JOB}-tile.webp`)).not.toBeNull()
  })

  it('a free work\'s tile comes from its protected small copy, under its own key', async () => {
    const sharp = (await import('sharp')).default
    const { store } = createMemoryStore()
    const thumb = await sharp({ create: { width: 480, height: 600, channels: 3, background: '#888' } }).webp().toBuffer()
    await store.put(`outputs/${STAFF}/${JOB}-thumb-p1.webp`, new Uint8Array(thumb), 'image/webp')
    const url = await resolveOrgWorkFile({ db: db({ credit_pool: 'free' }), store }, { user: OWNER, jobId: JOB, size: 'tile', download: false })
    expect(keyOf(url)).toBe(`outputs/${STAFF}/${JOB}-tile-p1.webp`)
  })
})

describe('signedOrgTiles', () => {
  it('signs only tiles that exist, of works the member check lets the user read', async () => {
    const { store } = createMemoryStore()
    expect((await signedOrgTiles({ db: db({ credit_pool: 'paid' }), store: () => store }, OWNER, [JOB])).size).toBe(0)
    await store.put(`outputs/${STAFF}/${JOB}-tile.webp`, new Uint8Array([1]), 'image/webp')
    const signed = await signedOrgTiles({ db: db({ credit_pool: 'paid' }), store: () => store }, OWNER, [JOB])
    expect(keyOf(signed.get(JOB)!)).toBe(`outputs/${STAFF}/${JOB}-tile.webp`)
    // Not a work of the user's org: nothing, whatever is in storage.
    expect((await signedOrgTiles({ db: db(null), store: () => store }, OWNER, [JOB])).size).toBe(0)
  })

  it('answers nothing, never throws, when storage is not configured', async () => {
    const unset = () => {
      throw new Error('R2 storage is not configured')
    }
    expect((await signedOrgTiles({ db: db({ credit_pool: 'paid' }), store: unset }, OWNER, [JOB])).size).toBe(0)
  })
})
