import { describe, expect, it } from 'vitest'

import type { LocalizedTemplate } from '../templates/localize'
import { galleryWorkView } from './work-view'

const template = {
  id: 'salmon',
  name: 'Grilled dish',
  category: 'food',
  fields: {
    copy: [
      { key: 'dish', label: 'Dish name', required: false, maxLength: 60, public: true },
      { key: 'phone', label: 'Phone', required: false, maxLength: 60, public: false },
    ],
  },
} as unknown as LocalizedTemplate

const row = { id: 'w1', templateId: 'salmon', creditPool: 'free' as const, parentJobId: null, inputs: { copy: { dish: 'Salmon', phone: '555-0100', gone: 'x' } } }

// ARCHITECTURE §9 第 3 条: template name and labelled copy only.
describe('galleryWorkView', () => {
  it('labels the public copy the template still asks for and drops the rest (private fields too)', () => {
    expect(galleryWorkView(row, [template])).toEqual({
      id: 'w1', templateId: 'salmon', templateName: 'Grilled dish', category: 'food',
      copy: [{ label: 'Dish name', value: 'Salmon' }], watermarked: true,
    })
  })

  it('hides a work whose template is no longer on sale, and shows a paid work without the mark', () => {
    expect(galleryWorkView(row, [])).toBeNull()
    expect(galleryWorkView({ ...row, creditPool: 'paid' }, [template])?.watermarked).toBe(false)
  })
})
