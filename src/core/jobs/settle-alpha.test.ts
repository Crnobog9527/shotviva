import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import type { GenerationProvider, ProviderInput, ProviderOutput } from './provider'
import { settleProviderCall, type SettleDeps } from './settle-generation'

// A 16² poster whose left half came back see-through (2026-11-15: GPT image on OpenRouter, a
// transparent logo upload, srgba output).
async function seeThroughPoster(): Promise<Uint8Array> {
  const half = await sharp({ create: { width: 8, height: 16, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer()
  const image = sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: half, left: 8, top: 0 }])
  return new Uint8Array(await image.png().toBuffer())
}

async function settledBytes(params: Record<string, unknown>, bytes: Uint8Array) {
  const store = vi.fn<(output: ProviderOutput) => Promise<string[]>>(async () => [])
  const provider: GenerationProvider = { id: 'fixture', generate: async () => ({ bytes, contentType: 'image/png' }) }
  const call: Omit<ProviderInput, 'signal'> = { prompt: 'test', images: [], aspectRatio: '1:1', resolution: '1k', quality: 'medium', params }
  const ledger = { id: 'fixture', source: 'admin_test', alerts: false, store, confirm: async () => null, fail: async () => true }
  await settleProviderCall({ provider } as SettleDeps, ledger, call)
  return store.mock.calls[0]![0].bytes
}

describe('results are stored opaque unless the template asked for a cut-out', () => {
  it.each([[{}], [{ background: 'opaque' }], [{ background: 'auto' }]])('flattens a see-through result for %j', async (params) => {
    const stored = await settledBytes(params, await seeThroughPoster())
    const meta = await sharp(stored).metadata()
    expect(meta).toMatchObject({ format: 'png', hasAlpha: false, width: 16, height: 16 })
    const { data } = await sharp(stored).raw().toBuffer({ resolveWithObject: true })
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255])
  })

  it('keeps the alpha of a transparent template’s cut-out', async () => {
    const poster = await seeThroughPoster()
    expect(await settledBytes({ background: 'transparent' }, poster)).toBe(poster)
  })

  it('stores an opaque result byte for byte', async () => {
    const opaque = new Uint8Array(await sharp({ create: { width: 4, height: 4, channels: 3, background: 'white' } }).png().toBuffer())
    expect(await settledBytes({}, opaque)).toBe(opaque)
  })
})
