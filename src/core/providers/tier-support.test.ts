import { describe, expect, it } from 'vitest'

import { fetchImageCapabilities } from './image-capabilities'
import { decideTiers, openAIImageTiers } from './tier-support'

describe('OpenAI image model table (PR-1b)', () => {
  it('opens 1K / 2K / 4K for the gpt-image-2 family and its snapshots', () => {
    for (const model of ['gpt-image-2', 'gpt-image-2.5', 'gpt-image-2.6', 'gpt-image-2.6-sunburst', 'gpt-image-2.6-2026-10-01', 'gpt-image-2.5-flare']) {
      expect(openAIImageTiers(model)).toEqual({ tiers: ['1k', '2k', '4k'], known: true })
    }
  })

  it('keeps gpt-image-1, 1.5 and 1-mini at 1K', () => {
    for (const model of ['gpt-image-1', 'gpt-image-1.5', 'gpt-image-1.5-2025-12-16', 'gpt-image-1-mini']) {
      expect(openAIImageTiers(model)).toEqual({ tiers: ['1k'], known: true })
    }
  })

  it('treats any other name as unknown: 1K until an admin declares more', () => {
    for (const model of ['gpt-image-3', 'gpt-image-10', 'gpt-image-2.7', 'dall-e-3', 'gpt-image-20']) {
      expect(openAIImageTiers(model)).toEqual({ tiers: ['1k'], known: false })
    }
  })
})

describe('decideTiers: detected tiers and the admin choice', () => {
  it('uses everything detected when there is no choice', () => {
    expect(decideTiers(['2k', '1k', '4k'], 'spec')).toEqual({ resolutions: ['1k', '2k', '4k'], source: 'spec', declared: [] })
  })

  it('lets a known model or a catalogue only narrow, and remembers the narrower choice', () => {
    expect(decideTiers(['1k', '2k', '4k'], 'spec', ['1k', '2k'])).toEqual({ resolutions: ['1k', '2k'], source: 'spec', limit: ['1k', '2k'], declared: [] })
    expect(decideTiers(['1k', '2k'], 'catalog', ['1k', '2k', '4k'])).toEqual({ resolutions: ['1k', '2k'], source: 'catalog', declared: [] })
    expect(decideTiers(['1k', '2k'], 'catalog', ['4k'])).toBeNull()
  })

  it('records an unknown model\'s extra tiers as a declaration', () => {
    expect(decideTiers(['1k'], 'unknown')).toEqual({ resolutions: ['1k'], source: 'unknown', declared: [] })
    expect(decideTiers(['1k'], 'unknown', ['1k'])).toEqual({ resolutions: ['1k'], source: 'unknown', declared: [] })
    expect(decideTiers(['1k'], 'unknown', ['4k', '1k', '2k'])).toEqual({ resolutions: ['1k', '2k', '4k'], source: 'declared', limit: ['1k', '2k', '4k'], declared: ['2k', '4k'] })
    expect(decideTiers(['1k'], 'unknown', [])).toBeNull()
  })
})

describe('fetchImageCapabilities for OpenAI and Ark', () => {
  it('reads the table, applies a narrower choice, and keeps it for the next refresh', async () => {
    expect((await fetchImageCapabilities('openai_images', 'https://api.openai.com/v1', 'gpt-image-2.6'))).toMatchObject({ resolutions: ['1k', '2k', '4k'], resolutionSource: 'spec' })
    const narrowed = await fetchImageCapabilities('openai_images', 'https://api.openai.com/v1', 'gpt-image-2.6', undefined, ['1k', '2k'])
    expect(narrowed).toMatchObject({ resolutions: ['1k', '2k'], resolutionSource: 'spec', resolutionLimit: ['1k', '2k'] })
    expect(await fetchImageCapabilities('openai_images', 'https://api.openai.com/v1', 'gpt-image-2.6', undefined, narrowed!.resolutionLimit)).toMatchObject({ resolutions: ['1k', '2k'] })
  })

  it('gives an unknown model 1K, or what was declared', async () => {
    const plain = await fetchImageCapabilities('openai_images', 'https://api.openai.com/v1', 'gpt-image-3')
    expect(plain).toMatchObject({ resolutions: ['1k'], resolutionSource: 'unknown' })
    expect(plain).not.toHaveProperty('resolutionLimit')
    expect(await fetchImageCapabilities('openai_images', 'https://api.openai.com/v1', 'gpt-image-3', undefined, ['1k', '4k']))
      .toMatchObject({ resolutions: ['1k', '4k'], resolutionSource: 'declared', resolutionLimit: ['1k', '4k'] })
  })

  it('never lets Ark go above 2K and refuses an empty choice', async () => {
    expect(await fetchImageCapabilities('ark_images', 'https://ark.example', 'doubao-seedream-5-5', undefined, ['1k', '2k', '4k'])).toMatchObject({ resolutions: ['1k', '2k'] })
    await expect(fetchImageCapabilities('ark_images', 'https://ark.example', 'doubao-seedream-5-5', undefined, ['4k'])).rejects.toMatchObject({ reason: 'invalid_input' })
  })
})
