import { describe, expect, it, vi } from 'vitest'

import { FULL_IMAGE_OPTIONS } from '../templates/image-options'
import { RESOLUTIONS } from '../templates/output-options'
import { parseServerEnv } from '../env'
import { modelFromTag } from '../jobs/provider-tag'
import { effectiveReferenceRange, resolveProvider } from './resolve'
import type { ProviderAdapters, ProviderConfig } from './types'

const ROW_ID = '6f1c2f9e-6a52-4c39-9a51-0a9f6b0c1d2e'
const RELAY_KEY = 'sk-relay-abcdef1234567890'

function recordingAdapters() {
  const configs: ProviderConfig[] = []
  const generate = vi.fn()
  const adapters: ProviderAdapters = {
    openai_images: (config) => {
      configs.push(config)
      return { id: 'openai-image', generate }
    },
  }
  return { adapters, configs }
}

const PRICES = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }
const row = { id: ROW_ID, resolutions: [...RESOLUTIONS], adapter: 'openai_images' as const, baseUrl: 'https://relay.example.com/v1', model: 'gpt-image-2.6', prices: PRICES }

describe('resolveProvider', () => {
  it("builds the adapter from the active row and its Vault key, and tags jobs <id>/<model>", async () => {
    const { adapters, configs } = recordingAdapters()
    const readKey = vi.fn(async () => RELAY_KEY)
    const env = parseServerEnv({ OPENAI_API_KEY: 'sk-env-should-not-be-used' })
    const provider = await resolveProvider('image', row, env, adapters, readKey)
    expect(provider.id).toBe(`${ROW_ID}/gpt-image-2.6`)
    // The row's prices travel with the provider so settlement can cost the job (T33).
    expect(provider.prices).toEqual(PRICES)
    expect(readKey).toHaveBeenCalledWith(ROW_ID)
    expect(configs).toEqual([{ baseUrl: 'https://relay.example.com/v1', model: 'gpt-image-2.6', apiKey: RELAY_KEY, resolutions: [...RESOLUTIONS] }])
  })

  it('falls back to OPENAI_* when no provider is active, without reading Vault', async () => {
    const { adapters, configs } = recordingAdapters()
    const readKey = vi.fn(async () => null)
    const env = parseServerEnv({ OPENAI_API_KEY: 'sk-env-0123456789', OPENAI_IMAGE_MODEL: 'gpt-image-2.5-sunburst' })
    const provider = await resolveProvider('image', null, env, adapters, readKey)
    expect(provider.id).toBe('env/gpt-image-2.5-sunburst')
    // No row to hold prices, so the model's official price applies (§10.0).
    expect(provider.prices).toEqual({ inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 })
    expect(readKey).not.toHaveBeenCalled()
    expect(configs).toEqual([{ baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2.5-sunburst', apiKey: 'sk-env-0123456789' }])
  })

  it("fills a row's empty prices from the price table for its model, keeping the ones it has", async () => {
    const { adapters } = recordingAdapters()
    const env = parseServerEnv({})
    const empty = { inputTextPerM: null, inputImagePerM: null, outputPerM: null }
    const official = { ...row, model: 'gpt-image-2.6-sunburst', prices: { ...empty, outputPerM: 40 } }
    expect((await resolveProvider('image', official, env, adapters, async () => RELAY_KEY)).prices).toEqual({ inputTextPerM: 5, inputImagePerM: 8, outputPerM: 40 })
    // A model the table does not know, with nothing filled in: no snapshot, so jobs are uncosted.
    expect((await resolveProvider('image', { ...row, prices: empty }, env, adapters, async () => RELAY_KEY)).prices).toBeNull()
  })

  it('fails without a fallback key, and when the active row has no key (no silent env fallback)', async () => {
    const { adapters, configs } = recordingAdapters()
    const noKey = async () => null
    await expect(resolveProvider('image', null, parseServerEnv({}), adapters, noKey)).rejects.toThrow(/OPENAI_API_KEY/)
    const env = parseServerEnv({ OPENAI_API_KEY: 'sk-env-0123456789' })
    await expect(resolveProvider('image', row, env, adapters, noKey)).rejects.toThrow(/has no API key/)
    expect(configs).toEqual([])
  })

  it('refuses a row whose adapter is not registered', async () => {
    await expect(resolveProvider('image', row, parseServerEnv({}), {}, async () => RELAY_KEY)).rejects.toThrow(/not registered/)
  })
})

describe('modelFromTag', () => {
  it('reads the model after the first slash, even when the model has one', () => {
    expect(modelFromTag(`${ROW_ID}/gpt-image-2.6`)).toBe('gpt-image-2.6')
    expect(modelFromTag('env/openai/gpt-image-1')).toBe('openai/gpt-image-1')
    expect(modelFromTag('openai-image')).toBeNull()
    expect(modelFromTag(null)).toBeNull()
  })
})

it('applies both the saved and current input limits to the resolved model', () => {
  const saved = { ...row, capabilities: { ...FULL_IMAGE_OPTIONS, minReferences: 1, maxReferences: 3, fetchedAt: '' } }
  expect(effectiveReferenceRange(saved, { input_references: { type: 'range', min: 2, max: 5 } }))
    .toEqual({ minReferences: 2, maxReferences: 3 })
  expect(effectiveReferenceRange(saved, { input_references: { type: 'range', min: 0, max: 2 } }))
    .toEqual({ minReferences: 1, maxReferences: 2 })
})
