import type { Client } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyCover, createCoverUpload, listAdminTemplates } from '@/core/admin'

import { animatedGif, jpeg, mp4Header, png, text } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { connectAdmin, createPricedTemplate } from './helpers'
import { serviceSupabase } from './supabase-env'

// T16 cover upload (ARCHITECTURE §8.3): staged in the private bucket's uploads-admin/, converted,
// published under covers/{template_id}/ in the public bucket, template row updated. Real local
// Supabase for the row, in-memory stores for both buckets.

const BASE = 'https://assets.test'
let db: Client

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

async function setup() {
  const templateId = await createPricedTemplate(db)
  const uploads = createMemoryStore()
  const assets = createMemoryStore()
  const deps = { db: serviceSupabase(), uploads: uploads.store, assets: assets.store, assetsBaseUrl: BASE }
  // What the browser does: ask for a ticket, then PUT the bytes to the staged key.
  const stage = async (purpose: 'before' | 'after' | 'motion' | 'poster', bytes: Uint8Array, contentType: string) => {
    const ticket = await createCoverUpload(uploads.store, { templateId, purpose, contentType, size: bytes.length })
    uploads.upload(ticket.key, bytes, contentType)
    return ticket.key
  }
  const row = async () => (await listAdminTemplates(serviceSupabase())).find((t) => t.id === templateId)
  return { templateId, uploads, assets, deps, stage, row }
}

const publicKeys = (assets: ReturnType<typeof createMemoryStore>) => [...assets.objects.keys()]

describe('admin cover upload', () => {
  it('stages under uploads-admin/{template}/ and refuses wrong types or sizes up front', async () => {
    const { templateId, uploads } = await setup()
    const ticket = await createCoverUpload(uploads.store, { templateId, purpose: 'after', contentType: 'image/png', size: 10 })
    expect(ticket.key).toMatch(new RegExp(`^uploads-admin/${templateId}/[0-9a-f-]{36}\\.png$`))
    await expect(
      createCoverUpload(uploads.store, { templateId, purpose: 'after', contentType: 'image/gif', size: 10 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      createCoverUpload(uploads.store, { templateId, purpose: 'motion', contentType: 'video/mp4', size: 16 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('turns a still into a 1600px WebP under covers/, points the row at it and clears staging', async () => {
    const { templateId, uploads, assets, deps, stage, row } = await setup()
    const key = await stage('after', await jpeg(3200, 2400), 'image/jpeg')
    await applyCover(deps, { templateId, slot: 'after', key })

    const [published] = publicKeys(assets)
    expect(published).toMatch(new RegExp(`^covers/${templateId}/after-[0-9a-f]{16}\\.webp$`))
    const meta = await sharp(assets.objects.get(published as string)?.body).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 1600, height: 1200 })
    expect((await row())?.coverAfterUrl).toBe(`${BASE}/${published}`)
    expect(uploads.objects.has(key)).toBe(false)
  })

  it('turns a GIF into an animated WebP plus a poster and marks the card animated', async () => {
    const { templateId, assets, deps, stage, row } = await setup()
    const key = await stage('motion', await animatedGif(), 'image/gif')
    await applyCover(deps, { templateId, slot: 'motion', key })

    const template = await row()
    expect(template).toMatchObject({ coverMediaType: 'animated' })
    const motionKey = template?.coverVideoUrl?.slice(BASE.length + 1) as string
    expect(motionKey).toMatch(new RegExp(`^covers/${templateId}/motion-[0-9a-f]{16}\\.webp$`))
    expect((await sharp(assets.objects.get(motionKey)?.body).metadata()).pages).toBe(3)
    expect(template?.coverPosterUrl).toMatch(new RegExp(`/covers/${templateId}/poster-[0-9a-f]{16}\\.webp$`))
  })

  it('stores an MP4 as is with its poster, and refuses one over 15 seconds or without a poster', async () => {
    const { templateId, assets, deps, stage, row } = await setup()
    const video = mp4Header(9)
    const key = await stage('motion', video, 'video/mp4')
    await expect(applyCover(deps, { templateId, slot: 'motion', key })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const posterKey = await stage('poster', await png(640, 360), 'image/png')
    await applyCover(deps, { templateId, slot: 'motion', key, posterKey })
    const template = await row()
    expect(template).toMatchObject({ coverMediaType: 'video' })
    const motionKey = template?.coverVideoUrl?.slice(BASE.length + 1) as string
    expect(motionKey).toMatch(/\.mp4$/)
    expect(assets.objects.get(motionKey)?.body).toEqual(video)

    const long = await stage('motion', mp4Header(16), 'video/mp4')
    const poster = await stage('poster', await png(640, 360), 'image/png')
    await expect(applyCover(deps, { templateId, slot: 'motion', key: long, posterKey: poster })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('15'),
    })
  })

  it('switches back to a still card, and only ever writes covers/ to the public bucket', async () => {
    const { templateId, assets, deps, stage, row } = await setup()
    await applyCover(deps, { templateId, slot: 'motion', key: await stage('motion', await animatedGif(), 'image/gif') })
    await applyCover(deps, { templateId, slot: 'clear-motion' })
    expect(await row()).toMatchObject({ coverMediaType: 'image', coverVideoUrl: null, coverPosterUrl: null })
    expect(publicKeys(assets).every((key) => key.startsWith(`covers/${templateId}/`))).toBe(true)
  })

  it('refuses bytes that are not what the slot takes, and keys of another template', async () => {
    const { templateId, deps, stage } = await setup()
    const fake = await stage('after', text('<html>definitely not a photo</html>'), 'image/jpeg')
    await expect(applyCover(deps, { templateId, slot: 'after', key: fake })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const still = await stage('motion', await jpeg(64, 64), 'image/webp')
    await expect(applyCover(deps, { templateId, slot: 'motion', key: still })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const other = await createPricedTemplate(db)
    const key = await stage('after', await jpeg(64, 64), 'image/jpeg')
    await expect(applyCover(deps, { templateId: other, slot: 'after', key })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
