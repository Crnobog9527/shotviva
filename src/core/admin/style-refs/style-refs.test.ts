import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { isStyleRefKey, styleRefsSchema } from '@/core/templates/style-refs'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { finishStyleRef, stageStyleRef, styleRefPreview } from './index'

describe('private admin style references', () => {
  it('issues a staging-only PUT, creates an immutable resized WebP and signs only that image namespace', async () => {
    const { store, objects, upload } = createMemoryStore()
    const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#333' } }).png().toBuffer()
    const ticket = await stageStyleRef(store, { templateId: 'sample', contentType: 'image/png', size: input.length })
    const staged = `uploads-admin/style-refs/sample/${ticket.uploadId}`
    expect(ticket.putUrl).toContain(staged)
    upload(staged, input, 'image/png')
    const ref = await finishStyleRef(store, { templateId: 'sample', uploadId: ticket.uploadId })
    expect(styleRefsSchema.parse([ref])).toEqual([ref])
    expect(isStyleRefKey('sample', ref.key)).toBe(true)
    expect(isStyleRefKey('other', ref.key)).toBe(false)
    expect(objects.has(staged)).toBe(false)
    expect(ref).toMatchObject({ width: 1536, height: 768 })
    expect(await sharp(await store.get(ref.key)).metadata()).toMatchObject({ format: 'webp', width: ref.width, height: ref.height })
    const imageId = ref.key.split('/')[2].slice(0, -5)
    expect(await styleRefPreview(store, { templateId: 'sample', imageId })).toContain(ref.key)
    await expect(styleRefPreview(store, { templateId: '../uploads', imageId })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(styleRefPreview(store, { templateId: 'sample', imageId: ref.key })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('rejects oversized objects before GET and refuses forged types or cross-template uploads', async () => {
    const { store, upload, objects } = createMemoryStore()
    const uploadId = randomUUID()
    const key = `uploads-admin/style-refs/sample/${uploadId}`
    upload(key, new Uint8Array(20), 'image/png')
    vi.spyOn(store, 'head').mockResolvedValueOnce({ size: 21 * 1024 * 1024, contentType: 'image/png' })
    const get = vi.spyOn(store, 'get')
    await expect(finishStyleRef(store, { templateId: 'sample', uploadId })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(get).not.toHaveBeenCalled()
    upload(key, new Uint8Array(20), 'image/png')
    await expect(finishStyleRef(store, { templateId: 'other', uploadId })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(objects.has(key)).toBe(true)
    await expect(finishStyleRef(store, { templateId: 'sample', uploadId })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(objects.size).toBe(0)
  })
})
