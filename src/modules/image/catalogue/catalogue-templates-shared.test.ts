import { describe, expect, it } from 'vitest'

import type { LocalizedTemplate } from '@/core/templates'

import { toCatalogueTemplate, toCatalogueTemplates } from './catalogue-template'

const confirm = { title: 'Before you turn this on', body: 'A long explanation. '.repeat(20), checkbox: 'I understand', accept: 'Turn on' }
const plating = { key: 'plating', label: 'Improve plating', hint: 'Arranges your dish more neatly.', confirm }

function template(id: string, toggles: unknown[], creditsCost = { '1k': 10, '2k': 20, '3k': 30 }): LocalizedTemplate {
  return {
    id,
    name: id,
    category: 'food',
    categoryView: { name: 'Food', sortOrder: 10, compare: false },
    description: `About ${id}`,
    fields: { images: { min: 1, max: 1 }, copy: [], toggles: structuredClone(toggles) },
    imageOptions: { resolutions: ['1k', '2k', '3k'], aspectRatios: ['1:1', '4:5'], originalRatio: true },
    creditsCost: { ...creditsCost },
    coverMediaType: 'image',
    coverBeforeUrl: null,
    coverAfterUrl: null,
    coverVideoUrl: null,
    coverPosterUrl: null,
  } as unknown as LocalizedTemplate
}

describe('toCatalogueTemplates', () => {
  const source = [template('a', [plating]), template('b', [plating]), template('c', []), template('d', [plating], { '1k': 1, '2k': 2, '3k': 3 })]
  const cards = toCatalogueTemplates(source)

  it('holds exactly what converting each template alone gives', () => {
    expect(cards).toEqual(source.map(toCatalogueTemplate))
  })

  it('makes equal options one object, so the page data carries each once', () => {
    expect(cards[0]!.toggles).toBe(cards[1]!.toggles)
    expect(cards[0]!.toggles[0]).toBe(cards[3]!.toggles[0])
    expect(cards[0]!.imageOptions).toBe(cards[2]!.imageOptions)
    expect(cards[0]!.creditsCost).toBe(cards[1]!.creditsCost)
  })

  it('keeps different values apart', () => {
    expect(cards[2]!.toggles).not.toBe(cards[0]!.toggles)
    expect(cards[3]!.creditsCost).not.toBe(cards[0]!.creditsCost)
    expect(cards[3]!.creditsCost).toEqual({ '1k': 1, '2k': 2, '3k': 3 })
  })
})
