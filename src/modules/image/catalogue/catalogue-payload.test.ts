import { expect, it } from 'vitest'

import { catalogueForm, toCataloguePayload } from './catalogue-payload'
import { isSlotTemplate, type CatalogueTemplate } from './catalogue-template'
import type { CatalogueView } from './catalogue-view'
import { browseView } from './picker-browse'

it('sends shared template cards once and keeps series membership and category text', () => {
  const template: CatalogueTemplate = {
    id: 'card', name: 'Card', category: 'food', categoryName: 'Food', categoryOrder: 0, compare: false,
    description: 'A card', creditsCost: { '1k': 2, '2k': 3, '4k': 4 },
    cover: { type: 'image', before: 'before.jpg', after: 'after.jpg', motion: null, poster: null },
    copyFields: [], toggles: [{ key: 'gloss', label: 'Gloss' }],
    imageSlots: [{ key: 'primary', label: 'Primary photo', required: true }],
  }
  const view: CatalogueView = {
    filters: [{ slug: 'food', name: 'Food', intro: 'Section copy', children: [] }],
    entries: [
      { type: 'template', template, path: ['food'] },
      { type: 'series', path: ['food'], series: { id: 's', slug: 's', name: 'Series', description: null, cover: null, categoryName: 'Food', members: [template] } },
    ],
  }

  const payload = toCataloguePayload(view)
  expect(payload.templates).toHaveLength(1)
  expect(payload.templates[0]).toMatchObject({ formDeferred: true, toggles: [] })
  expect(payload.templates[0]).not.toHaveProperty('imageSlots')
  expect(isSlotTemplate(payload.templates[0])).toBe(true)
  expect(catalogueForm(template).toggles).toEqual(template.toggles)
  const restored = browseView(payload.browse, payload.templates, false)
  expect(restored.filters).toEqual(view.filters)
  // The loose copy of the member is dropped: a template shows in its series only (Owner 2026-11-25).
  expect(restored.entries).toHaveLength(1)
  expect(restored.entries[0]).toMatchObject({ type: 'series', series: { members: [payload.templates[0]] } })
})
