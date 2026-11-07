import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { heicHeader, jpeg, png, text } from '../../../tests/fakes/images'
import { showMessages, withTicketImages, type TicketImageRow } from './images'

// T69: picked ticket images go from the uploader's inputs/ key to a re-encoded WebP under
// tickets/<author>/<ticket>/, with the clean-up rules of withTicketImages.

const USER = '11111111-1111-4111-8111-111111111111'
const ADMIN = '22222222-2222-4222-8222-222222222222'
const TICKET = '33333333-3333-4333-8333-333333333333'
const input = (owner: string, n: number) => `inputs/${owner}/4444444${n}-4444-4444-8444-444444444444.jpg`
const target = { uploaderId: USER, authorId: USER, ticketId: TICKET }

async function stored(write = vi.fn(async (images: TicketImageRow[]) => images)) {
  const memory = createMemoryStore()
  memory.upload(input(USER, 1), await jpeg(3000, 4000, { exif: true }), 'image/jpeg')
  memory.upload(input(USER, 2), await png(400, 300), 'image/png')
  return { ...memory, write, run: () => withTicketImages(memory.store, target, [input(USER, 1), input(USER, 2)], write) }
}

describe('withTicketImages', () => {
  it('stores each image as a ≤2048px WebP without EXIF under the ticket and deletes the uploads', async () => {
    const { run, objects } = await stored()
    const images = await run()
    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(image.object_key).toMatch(new RegExp(`^tickets/${USER}/${TICKET}/[0-9a-f-]{36}\\.webp$`))
      const meta = await sharp(objects.get(image.object_key)!.body).metadata()
      expect(meta.format).toBe('webp')
      expect(meta.exif).toBeUndefined()
      expect(image).toMatchObject({ content_type: 'image/webp', width: meta.width, height: meta.height, bytes: objects.get(image.object_key)!.body.length })
    }
    expect(images[0]).toMatchObject({ width: 1536, height: 2048 })
    expect(objects.has(input(USER, 1))).toBe(false)
    expect(objects.has(input(USER, 2))).toBe(false)
  })

  it('files the Owner’s images under the ticket author', async () => {
    const memory = createMemoryStore()
    memory.upload(input(ADMIN, 1), await jpeg(200, 200), 'image/jpeg')
    const [image] = await withTicketImages(memory.store, { uploaderId: ADMIN, authorId: USER, ticketId: TICKET }, [input(ADMIN, 1)], async (rows) => rows)
    expect(image!.object_key.startsWith(`tickets/${USER}/${TICKET}/`)).toBe(true)
  })

  it('runs the write with no images when none were picked', async () => {
    const { store } = createMemoryStore()
    await expect(withTicketImages(store, target, [], async (rows) => rows)).resolves.toEqual([])
  })

  it('deletes the stored WebPs and keeps the uploads when the write fails', async () => {
    const { run, objects } = await stored(vi.fn(async () => Promise.reject(new Error('RATE_LIMITED'))))
    await expect(run()).rejects.toThrow('RATE_LIMITED')
    expect([...objects.keys()].filter((key) => key.startsWith('tickets/'))).toEqual([])
    expect(objects.has(input(USER, 1))).toBe(true)
  })

})

describe('withTicketImages refusals', () => {
  it.each([
    ['someone else’s upload', [input(ADMIN, 1)]],
    ['a key outside inputs/', [`outputs/${USER}/x.png`]],
    ['four images', [1, 2, 3, 4].map((n) => input(USER, n))],
  ])('refuses %s before reading anything', async (_, keys) => {
    const { store } = createMemoryStore()
    const write = vi.fn()
    await expect(withTicketImages(store, target, keys, write)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses a ticket id that is not a uuid (it would become part of the key)', async () => {
    const { store } = createMemoryStore()
    await expect(withTicketImages(store, { ...target, ticketId: '../x' }, [], async () => 1)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it.each([
    ['an 11 MB object', () => new Uint8Array(11 * 1024 * 1024), 'image/jpeg', 'IMAGE_TOO_LARGE'],
    ['a renamed text file', () => text('not a picture'), 'image/jpeg', 'IMAGE_UNSUPPORTED'],
    ['a HEIC that reached the server', () => heicHeader(), 'image/jpeg', 'IMAGE_UNSUPPORTED'],
    ['a PDF', () => new Uint8Array(10), 'application/pdf', 'IMAGE_UNSUPPORTED'],
  ])('refuses %s, deletes that upload and writes nothing', async (_, body, type, code) => {
    const memory = createMemoryStore()
    memory.upload(input(USER, 1), await jpeg(100, 100), 'image/jpeg')
    memory.upload(input(USER, 2), body(), type)
    const write = vi.fn()
    await expect(withTicketImages(memory.store, target, [input(USER, 1), input(USER, 2)], write)).rejects.toMatchObject({ code, status: 422 })
    expect(write).not.toHaveBeenCalled()
    expect(memory.objects.has(input(USER, 2))).toBe(false)
    // The good one stays for a retry; nothing is left under tickets/.
    expect(memory.objects.has(input(USER, 1))).toBe(true)
    expect([...memory.objects.keys()].some((key) => key.startsWith('tickets/'))).toBe(false)
  })
})

describe('showMessages', () => {
  it('signs each image for 15 minutes and drops the key', async () => {
    const { store } = createMemoryStore()
    const key = `tickets/${USER}/${TICKET}/55555555-5555-4555-8555-555555555555.webp`
    const [message] = await showMessages(store, [
      { id: 'm', author: 'user', body: 'hi', createdAt: '2026-11-07T00:00:00Z', attachments: [{ id: 'a', objectKey: key, width: 10, height: 20 }] },
    ])
    expect(message).toEqual({
      id: 'm',
      author: 'user',
      body: 'hi',
      createdAt: '2026-11-07T00:00:00Z',
      images: [{ id: 'a', url: `memory://get/${key}?expires=900`, width: 10, height: 20 }],
    })
  })
})
