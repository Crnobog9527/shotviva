import { describe, expect, it } from 'vitest'

import { availableImageOptions, FULL_IMAGE_OPTIONS } from '../templates/image-options'
import { fetchImageCapabilities } from './image-capabilities'
import samples from './image-catalog-sample.test.json'

const catalog = async () => Response.json({ data: Object.entries(samples).map(([id, supported_parameters]) => ({ id, supported_parameters })) })
const models = Object.keys(samples)
describe('public /images/models parameters captured 2026-11-09', () => {
  it.each([
    [models[0], ['1k'], false, 3, 10],
    [models[1], ['1k', '2k', '3k'], true, 10, 15],
    [models[2], ['1k', '2k'], true, 14, 17],
  ] as const)('maps the advertised tiers, raw ratios and reference range for %s', async (model, resolutions, auto, max, count) => {
    const caps = await fetchImageCapabilities('openrouter_images', 'https://openrouter.ai/api/v1', model, catalog)
    expect(caps).toMatchObject({ resolutions, originalRatio: auto, minReferences: 0, maxReferences: max })
    expect(caps?.providerAspectRatios).toHaveLength(count)
    expect(caps?.aspectRatios).toEqual(FULL_IMAGE_OPTIONS.aspectRatios)
  })

  it('only exposes supported site ratios and preserves an explicitly empty intersection', () => {
    expect(availableImageOptions(FULL_IMAGE_OPTIONS, ['3:2', '3:4']).aspectRatios).toEqual(['3:2'])
    expect(availableImageOptions(FULL_IMAGE_OPTIONS, []).aspectRatios).toEqual([])
    expect(availableImageOptions(FULL_IMAGE_OPTIONS)).toEqual(FULL_IMAGE_OPTIONS)
  })
})
