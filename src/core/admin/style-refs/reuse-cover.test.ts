import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { styleRefsSchema } from '@/core/templates/style-refs'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { isRefFromAfterCover } from '../covers/after-cover-source'
import { reuseCoverStyleRef } from './index'

vi.mock('@/core/public-env', () => ({ publicEnv: { NEXT_PUBLIC_ASSETS_BASE_URL: 'https://assets.test' } }))

const hash = '0011223344556677'
const privateId = 'test-template'
const key = `covers/${privateId}/after-${hash}.webp`
const url = `https://assets.test/${key}`
const input = { templateId: privateId, locale: 'zh', hash }

function templateRow(common: string | null, locales: Record<string, unknown>) {
  const data = { cover_after_url: common, cover_locales: locales }
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data, error: null }) }))
  const db = { from: () => ({ select: () => ({ eq }) }) } as unknown as SupabaseClient
  return { db, eq }
}

describe('reuse the selected template after cover as a private reference', () => {
  it.each([
    [url, {}], [null, { en: { after: url } }], ['https://unused.test', { zh: { after: url } }],
  ] as const)('copies the locale or its effective fallback through private reference validation', async (common, locales) => {
    const { db, eq } = templateRow(common, locales)
    const assets = createMemoryStore()
    const dest = createMemoryStore()
    const image = await sharp({ create: { width: 46, height: 32, channels: 3, background: 'blue' } }).webp().toBuffer()
    assets.upload(key, image, 'image/webp')
    const ref = await reuseCoverStyleRef(db, assets.store, dest.store, input)
    expect(eq).toHaveBeenCalledWith('id', privateId)
    expect(styleRefsSchema.parse([ref])[0]).toMatchObject({ width: 46, height: 32 })
    expect(isRefFromAfterCover(ref.key, hash)).toBe(true)
    expect(isRefFromAfterCover(ref.key, '1111111111111111')).toBe(false)
    expect(isRefFromAfterCover(`style-refs/${privateId}/${randomUUID()}.webp`, hash)).toBe(false)
    expect([...assets.objects.keys()]).toEqual([key])
    expect([...dest.objects.keys()]).toEqual([ref.key])
  })

  it('imports a synchronized PNG cover and recognizes its fingerprint after reopening', async () => {
    const longHash = hash + 'a'.repeat(48)
    const synced = `covers/${privateId}/sync-${longHash}.png`
    const { db } = templateRow(`https://assets.test/${synced}`, {})
    const assets = createMemoryStore()
    const dest = createMemoryStore()
    const image = await sharp({ create: { width: 31, height: 11, channels: 3, background: 'red' } }).png().toBuffer()
    assets.upload(synced, image, 'image/png')
    const ref = await reuseCoverStyleRef(db, assets.store, dest.store, { ...input, hash: longHash })
    expect(isRefFromAfterCover(styleRefsSchema.parse([ref])[0].key, longHash)).toBe(true)
    expect(await sharp(await dest.store.get(ref.key)).metadata()).toMatchObject({ format: 'webp', width: 31, height: 11 })
  })

  it.each([
    [null, { zh: { before: url, video: url, media: 'video' } }],
    [url, { zh: { after: url.replace(hash, '1111111111111111') } }],
    [url.replace('assets.test', 'foreign.test'), {}],
    [url.replace(privateId, 'other-template'), {}],
    [url.replace('after-', 'before-'), {}],
    [url.replace('after-', 'poster-'), {}],
  ] as const)('rejects missing, stale or foreign sources before any object read', async (common, locales) => {
    const { db } = templateRow(common, locales)
    const { store } = createMemoryStore()
    const head = vi.spyOn(store, 'head')
    await expect(reuseCoverStyleRef(db, store, store, input)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(head).not.toHaveBeenCalled()
  })

  it('rejects a supplied URL and does not use a language-only cover in the common tab', async () => {
    const { db } = templateRow(null, { en: { after: url } })
    const { store } = createMemoryStore()
    await expect(reuseCoverStyleRef(db, store, store, { ...input, url })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(reuseCoverStyleRef(db, store, store, { ...input, locale: null })).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
