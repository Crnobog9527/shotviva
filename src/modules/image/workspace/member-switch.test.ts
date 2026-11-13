import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { memberSwitch } from './member-switch'

const member = (id: string, photoInput: CatalogueTemplate['photoInput'] = 'required') => ({ id, photoInput }) as CatalogueTemplate
const members = [member('a'), member('b'), member('text-only', 'none')]

describe('switching series members', () => {
  it('drops the previous template\'s text fields and toggles, and only those', () => {
    const step = memberSwitch(members, 'a', 'b')
    expect(step).toEqual({ memberId: 'b', values: { copy: {}, toggles: {} }, clearPhotos: false })
    // Photo, size, resolution and note are not in the patch, so they carry over.
    expect(Object.keys(step?.values ?? {})).toEqual(['copy', 'toggles'])
  })

  it('drops the picked photos for a member that takes none', () => {
    expect(memberSwitch(members, 'a', 'text-only')?.clearPhotos).toBe(true)
  })

  it('does nothing for the current member or an unknown one', () => {
    expect(memberSwitch(members, 'a', 'a')).toBeNull()
    expect(memberSwitch(members, 'a', 'gone')).toBeNull()
  })

  it('keeps text the next member asks for under the same key and type, and a choice still offered', () => {
    const field = (key: string, type = 'short', options?: string[]) => ({ key, label: key, type, required: false, maxLength: 5, public: false, ...(options ? { options: options.map((value) => ({ value, label: value })) } : {}) })
    const poster = (id: string, fields: object[]) => ({ id, photoInput: 'optional', copyFields: fields }) as unknown as CatalogueTemplate
    const from = poster('neon', [field('venue'), field('prize_1'), field('size', 'select', ['S', 'M']), field('count', 'number')])
    const to = poster('receipt', [field('venue'), field('prize_1', 'long'), field('size', 'select', ['M', 'L']), field('extra')])
    const step = memberSwitch([from, to], 'neon', 'receipt', { venue: 'Night Flight Bar', prize_1: 'Whisky', size: 'S', count: '3' })
    expect(step?.values.copy).toEqual({ venue: 'Night' })
    expect(memberSwitch([from, to], 'neon', 'receipt', { size: 'M' })?.values.copy).toEqual({ size: 'M' })
  })
})
