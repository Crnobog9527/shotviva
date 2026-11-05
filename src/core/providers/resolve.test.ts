import { randomBytes } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { parseServerEnv } from '../env'
import { modelFromTag } from '../jobs/provider-tag'
import { resolveProvider } from './resolve'
import { encryptSecret, parseSecretsKey, ProviderSecretError } from './secrets'
import type { ProviderAdapters, ProviderConfig } from './types'

const SECRETS_KEY = randomBytes(32).toString('base64')
const ROW_ID = '6f1c2f9e-6a52-4c39-9a51-0a9f6b0c1d2e'

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

const row = (apiKey = 'sk-relay-abcdef123456') => ({
  id: ROW_ID,
  adapter: 'openai_images' as const,
  baseUrl: 'https://relay.example.com/v1',
  model: 'gpt-image-2.6',
  apiKeyCiphertext: encryptSecret(apiKey, parseSecretsKey(SECRETS_KEY)),
})

describe('resolveProvider', () => {
  it('builds the adapter from the active row and tags jobs <id>/<model>', () => {
    const { adapters, configs } = recordingAdapters()
    const env = parseServerEnv({ PROVIDER_SECRETS_KEY: SECRETS_KEY, OPENAI_API_KEY: 'sk-env-should-not-be-used' })
    const provider = resolveProvider('image', row(), env, adapters)
    expect(provider.id).toBe(`${ROW_ID}/gpt-image-2.6`)
    expect(configs).toEqual([{ baseUrl: 'https://relay.example.com/v1', model: 'gpt-image-2.6', apiKey: 'sk-relay-abcdef123456' }])
  })

  it('falls back to OPENAI_* when no provider is active', () => {
    const { adapters, configs } = recordingAdapters()
    const env = parseServerEnv({ OPENAI_API_KEY: 'sk-env-0123456789', OPENAI_IMAGE_MODEL: 'gpt-image-2.5-sunburst' })
    const provider = resolveProvider('image', null, env, adapters)
    expect(provider.id).toBe('env/gpt-image-2.5-sunburst')
    expect(configs).toEqual([{ baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2.5-sunburst', apiKey: 'sk-env-0123456789' }])
  })

  it('fails without a fallback key, and on a key it cannot decrypt', () => {
    const { adapters } = recordingAdapters()
    expect(() => resolveProvider('image', null, parseServerEnv({}), adapters)).toThrow(/OPENAI_API_KEY/)
    const rotated = parseServerEnv({ PROVIDER_SECRETS_KEY: randomBytes(32).toString('base64') })
    expect(() => resolveProvider('image', row(), rotated, adapters)).toThrow(ProviderSecretError)
  })

  it('refuses a row whose adapter is not registered', () => {
    const env = parseServerEnv({ PROVIDER_SECRETS_KEY: SECRETS_KEY })
    expect(() => resolveProvider('image', row(), env, {})).toThrow(/not registered/)
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
