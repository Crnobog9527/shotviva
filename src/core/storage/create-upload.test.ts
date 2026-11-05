import { describe, expect, it } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { createUpload } from './create-upload'

const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'

describe('createUpload', () => {
  it('signs a 60-second PUT for a server-chosen key under the user prefix', async () => {
    const { store } = createMemoryStore()
    const ticket = await createUpload(store, USER, { content_type: 'image/jpeg', size: 1_500_000 })
    expect(ticket.input_key).toMatch(new RegExp(`^inputs/${USER}/[0-9a-f-]{36}\\.jpg$`))
    expect(ticket.put_url).toContain('expires=60')
    expect(ticket.headers).toEqual({ 'Content-Type': 'image/jpeg' })
  })

  it('refuses HEIC, oversize and malformed requests', async () => {
    const { store } = createMemoryStore()
    await expect(createUpload(store, USER, { content_type: 'image/heic', size: 10 })).rejects.toMatchObject({ code: 'IMAGE_UNSUPPORTED' })
    await expect(createUpload(store, USER, { content_type: 'image/jpeg', size: 21 * 1024 * 1024 })).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' })
    await expect(createUpload(store, USER, { key: 'inputs/x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
