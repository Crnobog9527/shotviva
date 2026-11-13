import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { slotStartInput } from './batch-request'
import type { BatchPhoto } from './photo-batch'
import { slotStatus, slotUploads } from './use-photo-batch'

const slots = [{ key: 'logo', required: false }, { key: 'prize_1', required: true }, { key: 'prize_2', required: false }]
const photo = (id: string, upload: BatchPhoto['upload']): BatchPhoto => ({ id, url: `blob:${id}`, bytes: 1, ratio: null, upload })
const done = (id: string) => photo(id, { phase: 'done', inputKey: `inputs/u/${id}.jpg` })

describe('slot photos (§5.1e)', () => {
  it('waits for a required slot and for any upload in progress', () => {
    expect(slotStatus(slots, [done('logo')])).toBe('none')
    expect(slotStatus(slots, [done('prize_1'), photo('logo', { phase: 'uploading', progress: 0.5 })])).toBe('uploading')
    expect(slotStatus(slots, [done('prize_1')])).toBe('ready')
    // A failed optional upload blocks Generate until it is picked again or removed.
    expect(slotStatus(slots, [done('prize_1'), photo('logo', { phase: 'error', code: 'UPLOAD_FAILED', message: '' })])).toBe('none')
  })

  it('sends only uploaded slots, in slot order', () => {
    expect(Object.keys(slotUploads(['logo', 'prize_1', 'prize_2'], [done('prize_2'), done('logo'), photo('prize_1', { phase: 'error', code: 'UPLOAD_FAILED', message: '' })])))
      .toEqual(['logo', 'prize_2'])
  })

  it('makes one job with input_slots, no single photo and a fixed size', () => {
    const template = {
      id: 'poster', name: 'Poster', creditsCost: { '1k': 2, '2k': 4, '3k': 6 }, toggles: [], copyFields: [],
      imageOptions: { originalRatio: true, aspectRatios: ['2:3', '1:1'], resolutions: ['1k'] }, imageSlots: slots,
    } as unknown as CatalogueTemplate
    const input = slotStartInput(template, { aspect: 'original', resolution: '1k', note: '', copy: {}, toggles: {} }, { logo: 'inputs/u/a.png' })
    expect(input).toMatchObject({ inputKey: null, credits: 2, body: { input_key: null, input_slots: { logo: 'inputs/u/a.png' } } })
    expect(input?.aspect).not.toBe('original')
  })
})
