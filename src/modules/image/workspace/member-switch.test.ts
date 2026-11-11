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
})
