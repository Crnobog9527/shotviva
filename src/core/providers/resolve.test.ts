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

  it('carries whether the adapter honours model_params.background (the cut-out record)', async () => {
    const generate = vi.fn()
    const env = parseServerEnv({})
    const honours: ProviderAdapters = { openai_images: () => ({ id: 'openai-image', honoursBackground: true, generate }) }
    const drops: ProviderAdapters = { openai_images: () => ({ id: 'relay', generate }) }
    expect((await resolveProvider('image', row, env, honours, async () => RELAY_KEY)).honoursBackground).toBe(true)
    expect((await resolveProvider('image', row, env, drops, async () => RELAY_KEY)).honoursBackground).toBeUndefined()
  })

  it("keeps the adapter's input check, so a rebuilt food call is checked against the routed model (§5.1c)", async () => {
    const accepts = vi.fn(() => false)
    const env = parseServerEnv({})
    const checks: ProviderAdapters = { openai_images: () => ({ id: 'relay', accepts, generate: vi.fn() }) }
    const request = { resolution: '1k' as const, aspectRatio: '4:3', referenceCount: 1 }
    expect((await resolveProvider('image', row, env, checks, async () => RELAY_KEY)).accepts?.(request)).toBe(false)
    expect(accepts).toHaveBeenCalledWith(request)
    const plain: ProviderAdapters = { openai_images: () => ({ id: 'relay', generate: vi.fn() }) }
    expect((await resolveProvider('image', row, env, plain, async () => RELAY_KEY)).accepts).toBeUndefined()
  })

  it('falls back to OPENAI_* when no provider is active, without reading Vault', async () => {
    const { adapters, configs } = recordingAdapters()
    const readKey = vi.fn(async () => null)
    const env = parseServerEnv({ OPENAI_API_KEY: 'sk-env-0123456789', OPENAI_IMAGE_MODEL: 'gpt-image-2.5-sunburst' })
    const provider = await resolveProvider('image', null, env, adapters, readKey)
    expect(provider.id).toBe('env/gpt-image-2.5-sunburst')
    // No row to hold a price and no price table in code (§10.0): usage is recorded, not a cost.
    expect(provider.prices).toBeNull()
    expect(readKey).not.toHaveBeenCalled()
    expect(configs).toEqual([{ baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2.5-sunburst', apiKey: 'sk-env-0123456789' }])
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

describe('resolveProvider prices (§10.0)', () => {
  it("prices an official OpenAI line from its catalogue snapshot, filling gaps from the row's own", async () => {
    const { adapters } = recordingAdapters()
    const env = parseServerEnv({})
    const empty = { inputTextPerM: null, inputImagePerM: null, outputPerM: null }
    // Fixture catalogue snapshot (real ones come from OpenRouter's public catalogue).
    const catalogPrice = {
      status: 'quoted' as const, catalogModel: 'openai/gpt-image-2.6-sunburst', source: 'https://openrouter.ai/openai/gpt-image-2.6-sunburst',
      fetchedAt: '2026-11-15T00:00:00.000Z', prices: { inputTextPerM: 5, inputImagePerM: null, outputPerM: 30 },
    }
    const official = { ...row, baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2.6-sunburst', prices: { ...empty, inputImagePerM: 9, outputPerM: 40 }, catalogPrice }
    // The catalogue wins where it quotes a price; the admin's entry fills the rest.
    expect((await resolveProvider('image', official, env, adapters, async () => RELAY_KEY)).prices).toEqual({ inputTextPerM: 5, inputImagePerM: 9, outputPerM: 30 })
    // A snapshot for another model prices nothing.
    expect((await resolveProvider('image', { ...official, model: 'gpt-image-3', prices: empty }, env, adapters, async () => RELAY_KEY)).prices).toBeNull()
    // A relay host has no catalogue: only what the admin typed in.
    expect((await resolveProvider('image', { ...row, prices: empty, catalogPrice }, env, adapters, async () => RELAY_KEY)).prices).toBeNull()
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
