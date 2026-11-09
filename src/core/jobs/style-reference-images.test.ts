import { randomUUID } from 'node:crypto'

import { afterEach, expect, it, vi } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import { logger } from '../logger'
import { templateImageProvider } from '../providers/template-image-provider'
import { FULL_IMAGE_OPTIONS } from '../templates/image-options'
import type { ImageRequestOptions } from './provider'
import { templateCall } from './generation-call'

const photo = { bytes: Uint8Array.of(11), contentType: 'image/jpeg' as const, width: 42, height: 56 }
const refs = [0, 1].map(() => ({ key: `style-refs/example/${randomUUID()}.webp`, width: 44, height: 55, uploadedAt: '2026-11-10T00:00:00Z' }))
const inputs = { copy: {}, aspectRatio: '1:1', note: '', toggles: {}, confirmed: [] }
const request = { resolution: '1k' as const, providerId: 'router' }
const template = { id: 'example', quality: 'medium' as const }
const prompt = { body: '{{photo_count}}|{{style_ref_count}}', modelParams: {}, version: 1, providerId: 'router', styleRefs: refs }

function setup(limit = 4) {
  const { store, upload } = createMemoryStore()
  refs.forEach((ref, i) => upload(ref.key, Uint8Array.of(21 + 10 * i), 'image/webp'))
  const get = vi.spyOn(store, 'get')
  const fallback = vi.fn(async () => ({ id: 'default', maxReferences: limit, generate: vi.fn() }))
  const lookup = async () => ({
    id: 'router', adapter: 'openrouter_images' as const, model: 'fixture', baseUrl: 'https://example.com',
    capabilities: { ...FULL_IMAGE_OPTIONS, minReferences: 0, maxReferences: 2, fetchedAt: '' },
    resolutions: ['1k' as const], prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null },
  })
  const provider = (id: string | null, options: ImageRequestOptions) =>
    templateImageProvider({}, id, options, { lookup, fallback })
  return { deps: { store, provider }, fallback, get }
}

afterEach(() => vi.restoreAllMocks())

it('falls back for a saved count limit, retaining photo-first order, placeholders and receipt', async () => {
  const { deps, fallback } = setup()
  const { call, provider, styleRefKeys } = await templateCall(deps, { template, prompt }, inputs, photo, request)
  expect(fallback).toHaveBeenCalledOnce()
  expect(provider.id).toBe('default')
  expect(call.images.map((im) => im.bytes[0])).toEqual([11, 21, 31])
  expect(call.prompt).toBe('1|2')
  expect(styleRefKeys).toEqual(refs.map((ref) => ref.key))
})

it('drops all styles before reading bytes when the default is also over its limit', async () => {
  const { deps, get } = setup(1)
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
  const { call, styleRefKeys } = await templateCall(deps, { template, prompt }, inputs, photo, request)
  expect(call.images).toEqual([photo])
  expect(call.prompt).toBe('1|0')
  expect(styleRefKeys).toEqual([])
  expect(get).not.toHaveBeenCalled()
  expect(warn.mock.calls).toHaveLength(1)
  expect(JSON.stringify(warn.mock.calls)).not.toContain('style-refs/')
})

it('loads once per version including concurrent requests and retries failed storage reads privately', async () => {
  const { deps, get } = setup()
  const invoke = (version: number) => templateCall(deps, { template, prompt: { ...prompt, version } }, inputs, photo, request)
  expect(get).not.toHaveBeenCalled()
  await Promise.all([invoke(1), invoke(1)])
  expect(get).toHaveBeenCalledTimes(2)
  get.mockRejectedValueOnce(new Error(refs[0]!.key))
  await expect(invoke(2)).rejects.toThrow('Template reference unavailable')
  await invoke(2)
  expect(get).toHaveBeenCalledTimes(5)
})
