import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

import { createConditionalR2Json } from './conditional-json'

function status(httpStatusCode: number) {
  return Object.assign(new Error('R2 response'), { $metadata: { httpStatusCode } })
}

describe('conditional JSON storage', () => {
  it('uses R2 preconditions for an absent object and a known version', async () => {
    const send = vi.fn().mockResolvedValue({ ETag: '"new"' })
    const store = createConditionalR2Json({ send }, 'private')
    await expect(store.write('cache', { phase: 'filling' }, null)).resolves.toBe('"new"')
    await store.write('cache', { phase: 'ready' }, '"known"')
    await store.write('cache', { phase: 'invalidated' })
    const commands = send.mock.calls.map(([command]) => (command as PutObjectCommand).input)
    expect(commands.map(({ IfMatch, IfNoneMatch }) => [IfMatch, IfNoneMatch])).toEqual([
      [undefined, '*'], ['"known"', undefined], [undefined, undefined],
    ])
    expect(commands[0]).toMatchObject({ Bucket: 'private', Key: 'cache', CacheControl: 'private, no-store' })
  })

  it('treats missing reads and precondition failures distinctly from outages', async () => {
    const send = vi.fn().mockRejectedValueOnce(status(404)).mockRejectedValueOnce(status(412)).mockRejectedValueOnce(status(503))
    const store = createConditionalR2Json({ send }, 'private')
    await expect(store.read('missing')).resolves.toBeNull()
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand)
    await expect(store.write('held', 'value', null)).resolves.toBeNull()
    await expect(store.write('down', 'value', null)).rejects.toMatchObject({ $metadata: { httpStatusCode: 503 } })
  })
})
