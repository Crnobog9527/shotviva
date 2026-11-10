import { expect, it } from 'vitest'
import type { ImageProviderOption } from '../image-provider-field'
import { bulkModelFailures } from './bulk-model-check'

const base = {
  id: 'first', name: 'First', module: 'image' as const,
  prompt: { providerId: null, styleRefs: [], body: 'fixture', modelParams: {}, version: 1 },
  fields: { images: { min: 1, max: 1 }, aspectRatios: ['1:1'], copy: [], toggles: [] },
}
const prices = { '1k': 10, '2k': 15, '3k': 1 }
const provider: ImageProviderOption = {
  id: 'model', label: 'Model', model: 'model', isActive: true, openAI: false,
  capabilities: { resolutions: ['1k','2k'], aspectRatios: ['1:1'], minReferences: 1, maxReferences: 2, originalRatio: false, fetchedAt: '2026-11-01T00:00:00Z' },
  floor: { high: prices, medium: prices, resolutions: ['1k','2k'] },
}

it('names every incompatible row and permits its valid sibling before the confirmation step', () => {
  const ratio = { ...base, id: 'ratio', fields: { ...base.fields, aspectRatios: ['4:5'] } }
  const range = { ...base, id: 'range', fields: { ...base.fields, images: { min: 1, max: 3 } } }
  const failures = bulkModelFailures([base, ratio, range], { providerId: null }, [provider])
  expect(failures).toMatchObject([{ id: 'ratio', reason: 'model' }, { id: 'range', reason: 'model' }])
})

it('rejects changing an unoffered price without changing the model', () => {
  expect(bulkModelFailures([base], { creditsCost: { '3k': 80 } }, [provider])).toMatchObject([{ id: 'first', reason: 'model' }])
  expect(bulkModelFailures([base], { creditsCost: { '2k': 80 } }, [provider])).toEqual([])
})
