import { PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

import { createR2MarkerStore } from './marker-store'

const fail = (status: number) => Object.assign(new Error(`HTTP ${status}`), { $metadata: { httpStatusCode: status } })

function client(outcomes: (number | null)[]) {
  const send = vi.fn(async (...args: unknown[]) => {
    void args
    const status = outcomes.shift()
    if (status) throw fail(status)
    return {}
  })
  return { send, inputs: () => send.mock.calls.map(([command]) => (command as unknown as PutObjectCommand).input) }
}

describe('createR2MarkerStore', () => {
  it('claims an absent marker with If-None-Match: *, under an abort signal', async () => {
    const c = client([null])
    await expect(createR2MarkerStore(c as never, 'b').claim('ops/alerts/k', null)).resolves.toBe(true)
    expect(c.inputs()[0]).toMatchObject({ Bucket: 'b', Key: 'ops/alerts/k', IfNoneMatch: '*' })
    expect((c.send.mock.calls[0] as unknown as [unknown, { abortSignal: AbortSignal }])[1].abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('without a cooldown, a marker that exists stays taken', async () => {
    const c = client([412])
    await expect(createR2MarkerStore(c as never, 'b').claim('k', null)).resolves.toBe(false)
    expect(c.send).toHaveBeenCalledTimes(1)
  })

  it('with a cooldown, retakes a marker last written before it (If-Unmodified-Since), not a fresh one', async () => {
    const stale = new Date('2026-11-08T10:00:00Z')
    const old = client([412, null])
    await expect(createR2MarkerStore(old as never, 'b').claim('k', stale)).resolves.toBe(true)
    expect(old.inputs()[1]).toMatchObject({ IfUnmodifiedSince: stale })
    const fresh = client([412, 412])
    await expect(createR2MarkerStore(fresh as never, 'b').claim('k', stale)).resolves.toBe(false)
    const race = client([409])
    await expect(createR2MarkerStore(race as never, 'b').claim('k', null)).resolves.toBe(false)
  })

  it('throws anything else (the caller decides)', async () => {
    await expect(createR2MarkerStore(client([500]) as never, 'b').claim('k', null)).rejects.toThrow('HTTP 500')
  })
})
