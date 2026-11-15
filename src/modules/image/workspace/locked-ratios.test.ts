import { describe, expect, it } from 'vitest'
import { allowedWebAspects } from '@/core/templates/allowed-web-aspects'
import type { ImageOptions } from '@/core/templates/image-options'
import { sharedOptions } from '../matrix/matrix-state'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { chosenAspect, selectedAspect } from './output-choice'
import { sizeChoices } from './workspace-options'

// A prize poster as template_image_options returns it with the ratio lock on (1554).
const locked: ImageOptions = { resolutions: ['1k', '2k'], aspectRatios: ['2:3'], originalRatio: false, lockedRatios: true }
const open: ImageOptions = { resolutions: ['1k'], aspectRatios: ['16:9', '4:5', '1:1', '2:3'], originalRatio: false }

describe('a template with locked ratios', () => {
  it('shows only its ratios, with no 跟随照片 tile even once a photo is measured', () => {
    expect(sizeChoices(locked).map(({ id }) => id)).toEqual(['2:3'])
    expect(sizeChoices(locked, 16 / 9).map(({ id }) => id)).toEqual(['2:3'])
  })

  it('starts on its first ratio instead of original, and moves an older choice onto it', () => {
    expect(selectedAspect('original', locked)).toBe('2:3')
    expect(chosenAspect('original', locked, 16 / 9)).toBe('2:3')
    expect(chosenAspect('original', locked)).toBe('2:3')
    expect(selectedAspect('16:9', locked)).toBe('2:3')
  })

  it('is refused anything else on the server, original included', () => {
    expect(allowedWebAspects(locked, '1k')).toEqual(['2:3'])
    expect(allowedWebAspects(locked, '2k')).not.toContain('original')
  })

  it('keeps the lock when a batch mixes it with an open template', () => {
    const shared = sharedOptions([{ imageOptions: locked }, { imageOptions: open }] as CatalogueTemplate[])
    expect(shared).toMatchObject({ aspectRatios: ['2:3'], lockedRatios: true })
    expect(sizeChoices(shared, 1).map(({ id }) => id)).toEqual(['2:3'])
  })

  it('leaves an open template as before: its nearest-size tile still follows the photo', () => {
    expect(sizeChoices(open, 0.8)[0]).toMatchObject({ id: 'original', nearest: '4:5' })
    expect(selectedAspect('original', open)).toBe('original')
  })
})
