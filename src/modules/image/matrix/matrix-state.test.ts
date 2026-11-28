import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { ReadyPhoto } from '../workspace/photo-batch'
import { matrixCta } from './matrix-cta'
import { matrixStartInputs } from './matrix-request'
import {
  cellKey, EMPTY_MATRIX, matrixBlock, matrixCells, matrixTotal, MATRIX_MAX_CELLS, onlyTemplate, pickTemplate, sharedOptions, withTemplates,
  toggleCell, totalsByResolution, withoutTemplate, withTemplate, type MatrixValues,
} from './matrix-state'

const template = (id: string, extra: Partial<CatalogueTemplate> = {}): CatalogueTemplate => ({
  id, name: id.toUpperCase(), category: 'c', categoryName: 'C', categoryOrder: 0, compare: false, description: null, photoInput: 'required',
  imageOptions: { resolutions: ['1k', '2k', '4k'], aspectRatios: ['1:1', '4:5', '16:9'], originalRatio: true },
  creditsCost: { '1k': 2, '2k': 4, '4k': 6 }, copyFields: [], toggles: [],
  cover: { type: 'image', before: null, after: null, motion: null, poster: null }, ...extra,
})
const ready = (id: string, originalRatio = 0.8, name?: string): ReadyPhoto => ({
  photo: { id, url: `blob:${id}`, bytes: 1, ratio: null, upload: { phase: 'done', inputKey: `in/${id}` }, originalRatio, ...(name ? { name } : {}) },
  inputKey: `in/${id}`,
})

const poster = template('poster', { creditsCost: { '1k': 3, '2k': 5, '4k': 8 }, copyFields: [{ key: 'headline', label: 'Headline', type: 'short', required: true, maxLength: 40, public: false }], toggles: [{ key: 'plate', label: 'Plate' }] })
const white = template('white')
const photos = [ready('p1', 0.8, 'IMG_1.jpg'), ready('p2', 1.5)]
const values = (patch: Partial<MatrixValues> = {}): MatrixValues => ({ ...EMPTY_MATRIX, templateIds: ['poster', 'white'], ...patch })

describe('the multi-template grid', () => {
  it('prices each cell by its template and leaves out removed cells', () => {
    const cells = matrixCells([poster, white], photos.map(({ photo }) => photo), values({ removed: [cellKey('white', 'p2')] }))
    expect(cells.map((cell) => [cell.key, cell.credits, cell.removed])).toEqual([
      ['poster|p1', 5, false], ['poster|p2', 5, false], ['white|p1', 4, false], ['white|p2', 4, true],
    ])
    expect(matrixTotal(cells)).toBe(14)
    // A plain batch offers no 1K (1996): a 1K whole-batch total lands on each template's 2K.
    expect(totalsByResolution(cells)).toEqual({ '1k': 14, '2k': 14, '4k': 22 })
  })

  it('shares a template\'s text across its photos and lets one photo override it', () => {
    const v = values({ copy: { poster: { headline: 'Sale' } }, overrides: { [cellKey('poster', 'p2')]: { headline: 'Last one' } } })
    const cells = matrixCells([poster], photos.map(({ photo }) => photo), v)
    expect(cells.map((cell) => cell.copy.headline)).toEqual(['Sale', 'Last one'])
  })

  it('blocks Generate in the order the user fixes things, and at the Max cell limit', () => {
    const options = sharedOptions([poster, white])
    const cells = (v: MatrixValues) => matrixCells([poster, white], photos.map(({ photo }) => photo), v)
    expect(matrixBlock([], 0, { picked: 0, uploading: false }, options, MATRIX_MAX_CELLS)).toBe('templates')
    expect(matrixBlock([], 2, { picked: 0, uploading: false }, options, MATRIX_MAX_CELLS)).toBe('photos')
    expect(matrixBlock(cells(values()), 2, { picked: 2, uploading: true }, options, MATRIX_MAX_CELLS)).toBe('uploading')
    expect(matrixBlock(cells(values()), 2, { picked: 2, uploading: false }, options, MATRIX_MAX_CELLS)).toBe('copy')
    expect(matrixBlock(cells(values({ copy: { poster: { headline: 'Hi' } } })), 2, { picked: 2, uploading: false }, options, MATRIX_MAX_CELLS)).toBeNull()
    const all = cells(values()).map((cell) => cell.key)
    expect(matrixBlock(cells(values({ removed: all })), 2, { picked: 2, uploading: false }, options, MATRIX_MAX_CELLS)).toBe('empty')
    const many = Array.from({ length: 16 }, (_, i) => ({ id: `x${i}` }))
    expect(matrixCells([poster, white], many, values()).length).toBe(32)
    expect(matrixBlock(matrixCells([poster, white], many, values()), 2, { picked: 16, uploading: false }, options, MATRIX_MAX_CELLS)).toBe('too-many')
    expect(MATRIX_MAX_CELLS).toBe(30)
  })

  // One size for the batch; tiers are per result, so the batch offers every tier any template
  // sells it. 1K is free credits only (1996): only an affiliate org member's batch offers it (2034).
  it('keeps one size the templates share and every tier any of them offers, 1K only with promotion credits', () => {
    const narrow = template('narrow', { imageOptions: { resolutions: ['1k', '2k'], aspectRatios: ['1:1', '9:16'], originalRatio: false } })
    expect(sharedOptions([poster, narrow])).toEqual({ resolutions: ['2k', '4k'], aspectRatios: ['1:1'], originalRatio: false })
    expect(sharedOptions([poster, narrow], true).resolutions).toEqual(['1k', '2k', '4k'])
    expect(EMPTY_MATRIX.resolution).toBe('2k')
  })

  it('adds up to five templates once each, and a removed template takes its settings along', () => {
    let v = EMPTY_MATRIX
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'a']) v = withTemplate(v, id)
    expect(v.templateIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    v = { ...v, copy: { b: { x: '1' } }, removed: [cellKey('b', 'p1'), cellKey('c', 'p1')], overrides: { [cellKey('b', 'p1')]: { x: '2' } },
      tiers: { [cellKey('b', 'p1')]: '4k', [cellKey('c', 'p1')]: '4k' }, notes: { [cellKey('b', 'p1')]: 'less sauce' } }
    const out = withoutTemplate(v, 'b')
    expect(out).toMatchObject({ templateIds: ['a', 'c', 'd', 'e'], copy: {}, overrides: {}, notes: {}, tiers: { [cellKey('c', 'p1')]: '4k' }, removed: [cellKey('c', 'p1')] })
    expect(toggleCell(toggleCell(out, cellKey('a', 'p1')), cellKey('a', 'p1')).removed).toEqual([cellKey('c', 'p1')])
  })

  it('applies one template to more photos with its text and toggles kept', () => {
    const v = values({ copy: { poster: { headline: 'Sale' } }, toggles: { poster: { plate: true } }, resolution: '2k', removed: [cellKey('white', 'p1')] })
    expect(onlyTemplate(v, 'poster')).toEqual({ ...EMPTY_MATRIX, templateIds: ['poster'], copy: { poster: { headline: 'Sale' } }, toggles: { poster: { plate: true } }, resolution: '2k' })
  })
})

describe('per-result tiers (Owner 2026-11-28)', () => {
  it('gives each result its own tier among its template\'s, priced by that template', () => {
    const seedream = template('seedream', { imageOptions: { resolutions: ['1k', '2k'], aspectRatios: ['1:1'], originalRatio: true }, creditsCost: { '1k': 9, '2k': 9, '4k': 9 } })
    const v = values({ templateIds: ['poster', 'seedream'], resolution: '4k', tiers: { [cellKey('poster', 'p2')]: '2k' } })
    const cells = matrixCells([poster, seedream], photos.map(({ photo }) => photo), v)
    // Seedream sells no 4K: the 4K default lands on its 2K; poster's own pick for p2 holds.
    expect(cells.map((cell) => [cell.key, cell.tier, cell.credits, cell.pool])).toEqual([
      ['poster|p1', '4k', 8, 'paid'], ['poster|p2', '2k', 5, 'paid'], ['seedream|p1', '2k', 9, 'paid'], ['seedream|p2', '2k', 9, 'paid'],
    ])
    expect(cells[2]?.tiers).toEqual(['2k'])
    const promo = matrixCells([seedream], photos.map(({ photo }) => photo), values({ templateIds: ['seedream'], resolution: '1k' }), true)
    expect(promo.map((cell) => [cell.tier, cell.pool])).toEqual([['1k', 'free'], ['1k', 'free']])
  })

  it('blocks a result whose template offers a batch no tier', () => {
    const freeOnly = template('free', { imageOptions: { resolutions: ['1k'], aspectRatios: ['1:1'], originalRatio: true } })
    const cells = matrixCells([freeOnly], photos.map(({ photo }) => photo), values({ templateIds: ['free'] }))
    expect(cells[0]?.tier).toBeNull()
    expect(matrixBlock(cells, 1, { picked: 2, uploading: false }, sharedOptions([freeOnly]), MATRIX_MAX_CELLS)).toBe('options')
  })
})

describe('the multi-template request', () => {
  it('sends one job per kept cell with one size, the cell text and the template toggles', () => {
    const v = values({ copy: { poster: { headline: 'Sale' } }, toggles: { poster: { plate: true } }, removed: [cellKey('white', 'p2')], aspect: 'original' })
    const start = matrixStartInputs(matrixCells([poster, white], photos.map(({ photo }) => photo), v), v, photos)
    expect(start?.names).toEqual(['IMG_1.jpg', 'photo-2', 'IMG_1.jpg'])
    expect(start?.inputs.map((input) => [input.templateId, input.inputKey, input.credits, input.aspect])).toEqual([
      ['poster', 'in/p1', 5, 'original'], ['poster', 'in/p2', 5, 'original'], ['white', 'in/p1', 4, 'original'],
    ])
    expect(start?.inputs[0]?.body).toMatchObject({ template_id: 'poster', expected_credits: 5, inputs: { copy: { headline: 'Sale' }, resolution: '2k', aspect_ratio: 'original', toggles: { plate: true } } })
    expect(start?.inputs[2]?.body).not.toHaveProperty('inputs.toggles')
    expect(start?.inputs[0]?.body).not.toHaveProperty('inputs.note')
  })

  it('sends each result\'s own tier and trimmed note, and no note when it is blank', () => {
    const v = values({ copy: { poster: { headline: 'Sale' } }, tiers: { [cellKey('poster', 'p2')]: '4k' }, notes: { [cellKey('poster', 'p1')]: '  less sauce  ', [cellKey('white', 'p1')]: '   ' } })
    const start = matrixStartInputs(matrixCells([poster, white], photos.map(({ photo }) => photo), v), v, photos)
    expect(start?.inputs.map((input) => [input.resolution, input.credits, (input.body as { inputs?: { note?: string } }).inputs?.note])).toEqual([
      ['2k', 5, 'less sauce'], ['4k', 8, undefined], ['2k', 4, undefined], ['2k', 4, undefined],
    ])
    expect(start?.inputs[1]?.body).toMatchObject({ expected_credits: 8, inputs: { resolution: '4k' } })
  })

  it('uses the first photo\'s nearest shared size when the templates cannot keep each photo\'s shape', () => {
    const fixed = template('fixed', { imageOptions: { resolutions: ['2k'], aspectRatios: ['1:1', '4:5', '16:9'], originalRatio: false } })
    const v: MatrixValues = { ...EMPTY_MATRIX, templateIds: ['fixed'] }
    const start = matrixStartInputs(matrixCells([fixed], photos.map(({ photo }) => photo), v), v, photos)
    expect(start?.inputs.map((input) => input.aspect)).toEqual(['4:5', '4:5'])
  })

  it('sends nothing while a kept cell has no uploaded photo', () => {
    const v = values({ copy: { poster: { headline: 'x' } } })
    expect(matrixStartInputs(matrixCells([poster], [{ id: 'p1' }, { id: 'p9' }], v), v, photos)).toBeNull()
  })
})

describe('the batch primary', () => {
  const balance = { paid: 10, free: 50 }
  const paid = (credits: number) => ({ credits, pool: 'paid' as const, removed: false })
  const free = (credits: number) => ({ credits, pool: 'free' as const, removed: false })
  it('asks for credits as soon as the paid cells are over the paid pool, free credits never count', () => {
    expect(matrixCta('uploading', [paid(6), paid(6)], 2, balance, false)).toEqual({ kind: 'get-credits', total: 12, needed: 2, count: 2 })
    expect(matrixCta(null, [paid(6), paid(4), { ...paid(9), removed: true }], 2, balance, false)).toEqual({ kind: 'generate', total: 10, count: 2 })
  })
  it('checks 1K cells against the promotion share, and never sends that shortfall to the paywall', () => {
    expect(matrixCta(null, [paid(10), free(40)], 2, balance, false)).toEqual({ kind: 'generate', total: 50, count: 2 })
    expect(matrixCta(null, [paid(10), free(40), free(20)], 3, balance, false)).toEqual({ kind: 'promo-short', needed: 10 })
  })
  it('says what is missing first, and holds while the preflight checks', () => {
    expect(matrixCta('templates', [], 0, balance, false)).toEqual({ kind: 'blocked', block: 'templates' })
    expect(matrixCta('too-many', [paid(64)], 32, balance, false)).toEqual({ kind: 'blocked', block: 'too-many' })
    expect(matrixCta('copy', [paid(4)], 2, balance, false)).toEqual({ kind: 'blocked', block: 'copy' })
    expect(matrixCta(null, [paid(4)], 2, balance, true)).toEqual({ kind: 'checking' })
  })
})

describe('the grid\'s text fields', () => {
  it('blocks Generate on a choice or number the server would refuse, like the single form', () => {
    const sized = template('sized', { copyFields: [
      { key: 'size', label: 'Size', type: 'select', options: [{ value: 'Small', label: 'Small' }, { value: 'Large', label: 'Large' }], required: false, maxLength: 60, public: false },
      { key: 'guests', label: 'Guests', type: 'number', min: 1, max: 20, required: false, maxLength: 4, public: false },
    ] })
    const options = sharedOptions([sized])
    const block = (copy: Record<string, string>) =>
      matrixBlock(matrixCells([sized], photos.map(({ photo }) => photo), values({ templateIds: ['sized'], copy: { sized: copy } })), 1, { picked: 2, uploading: false }, options, MATRIX_MAX_CELLS)
    expect(block({ size: 'Huge' })).toBe('copy')
    expect(block({ guests: '50' })).toBe('copy')
    expect(block({ guests: 'four' })).toBe('copy')
    expect(block({ size: 'Large', guests: '4' })).toBeNull()
    expect(block({})).toBeNull()
  })
})

describe('the batch on each plan (Batch create, Owner 2026-11-12)', () => {
  it('stops a Pro batch at its own size: one template on up to 10 photos', () => {
    const options = sharedOptions([white])
    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `x${i}` }))
    const one = values({ templateIds: ['white'] })
    expect(matrixBlock(matrixCells([white], eleven.slice(0, 10), one), 1, { picked: 10, uploading: false }, options, 10)).toBeNull()
    expect(matrixBlock(matrixCells([white], eleven, one), 1, { picked: 11, uploading: false }, options, 10)).toBe('too-many')
  })

  it('picks templates up to the plan: Max adds up to five, Pro swaps its one template', () => {
    const max = ['a', 'b', 'c', 'd', 'e', 'f'].reduce((v, id) => pickTemplate(v, id, 5), EMPTY_MATRIX)
    expect(max.templateIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(pickTemplate(max, 'c', 5).templateIds).toEqual(['a', 'b', 'd', 'e'])
    const pro = pickTemplate({ ...EMPTY_MATRIX, templateIds: ['poster'], copy: { poster: { headline: 'Sale' } }, toggles: { poster: { plate: true } } }, 'white', 1)
    expect(pro).toMatchObject({ templateIds: ['white'], copy: {}, toggles: {} })
    // Tapping the chosen one on Pro keeps it (the row's ✕ removes it).
    expect(pickTemplate(pro, 'white', 1)).toBe(pro)
  })

  it('opens on the asked templates, keeping a staying template\'s text, up to the plan', () => {
    const v = { ...EMPTY_MATRIX, templateIds: ['poster', 'white'], copy: { poster: { headline: 'Sale' } } }
    expect(withTemplates(v, ['poster'], 5)).toMatchObject({ templateIds: ['poster'], copy: { poster: { headline: 'Sale' } } })
    expect(withTemplates(v, ['scene'], 5)).toMatchObject({ templateIds: ['scene'], copy: {} })
    expect(withTemplates(EMPTY_MATRIX, ['a', 'b'], 1).templateIds).toEqual(['a'])
  })
})
