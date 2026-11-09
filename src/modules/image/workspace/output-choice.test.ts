import { describe, expect, it } from 'vitest'
import { FULL_IMAGE_OPTIONS, type ImageOptions } from '@/core/templates/image-capabilities'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { startInputs } from './batch-request'
import { chosenAspect, closestAspect, closestResolution, hasOutputOptions, selectedAspect } from './output-choice'
import { sizeChoices } from './workspace-options'

const limited: ImageOptions = { resolutions: ['1k'], aspectRatios: ['4:5', '1:1', '16:9'], originalRatio: false }
const empty: ImageOptions = { resolutions: [], aspectRatios: [], originalRatio: false }

describe('template output choices', () => {
  it('matches the actual dimensions to supported ratios, including extreme orientations', () => {
    expect(closestAspect(420 / 481, limited)).toBe('4:5')
    expect(closestAspect(2000 / 200, limited)).toBe('16:9')
    expect(closestAspect(200 / 2000, limited)).toBe('4:5')
    expect(closestAspect(0, limited)).toBeNull()
    expect(closestAspect(1.2, empty)).toBeNull()
  })

  it('waits for a photo before offering its nearest match and keeps explicit choices available', () => {
    expect(sizeChoices(limited).map(({ id }) => id)).toEqual(['16:9', '4:5', '1:1'])
    expect(sizeChoices(limited, 0.75)[0]).toMatchObject({ id: 'original', nearest: '4:5' })
    expect(chosenAspect('original', limited)).toBeNull()
    expect(chosenAspect('1:1', limited)).toBe('1:1')
    expect(sizeChoices(FULL_IMAGE_OPTIONS)).toHaveLength(8)
    expect(chosenAspect('original', FULL_IMAGE_OPTIONS)).toBe('original')
  })

  it('adjusts a historical fixed size and tier by distance; a tied tier uses the smaller size', () => {
    expect(selectedAspect('2:3', limited)).toBe('4:5')
    expect(selectedAspect('3:2', limited)).toBe('16:9')
    expect(closestResolution('3k', limited)).toBe('1k')
    expect(closestResolution('2k', { ...limited, resolutions: ['3k', '1k'] })).toBe('1k')
    expect(hasOutputOptions(empty)).toBe(false)
    expect(hasOutputOptions({ ...empty, resolutions: ['1k'] })).toBe(false)
    expect(hasOutputOptions({ ...empty, resolutions: ['1k'], originalRatio: true })).toBe(true)
  })

  it('resolves each batch photo before enqueueing and never submits a partial batch or unavailable settings', () => {
    const template: CatalogueTemplate = {
      id: 'qa', name: 'QA', imageOptions: limited, creditsCost: { '1k': 2, '2k': 4, '3k': 6 }, toggles: [],
      category: 'test', categoryName: 'QA', categoryOrder: 0, compare: false, description: null,
      copyFields: [], cover: { type: 'image', before: null, after: null, motion: null, poster: null },
    }
    const values = { aspect: 'original', resolution: '3k', note: '', copy: {}, toggles: {} } as const
    const photos = [0.75, 2].map((originalRatio, i) => ({
      photo: { id: String(i), url: 'blob:photo', bytes: 123, ratio: null, upload: { phase: 'done' as const, inputKey: 'key' }, originalRatio }, inputKey: 'key',
    }))
    const jobs = startInputs(template, values, photos)
    expect(jobs.map((job) => job.aspect)).toEqual(['4:5', '16:9'])
    for (const job of jobs) expect(job).toMatchObject({ resolution: '1k', credits: 2, body: { inputs: { resolution: '1k', aspect_ratio: job.aspect } } })
    expect(startInputs(template, values, [...photos, { ...photos[0]!, photo: { ...photos[0]!.photo, originalRatio: undefined } }])).toEqual([])
    expect(startInputs({ ...template, imageOptions: empty }, values, photos)).toEqual([])
  })
})
