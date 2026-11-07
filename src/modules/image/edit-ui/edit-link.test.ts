import { describe, expect, it } from 'vitest'

import { editHref, opensEdit } from './edit-link'

describe('editHref', () => {
  it('goes to the finished photo with the edit panel open', () => {
    expect(editHref('3f1c2b9e-0d4a-4c6b-9a51-2e7f8c0d1a23')).toBe('/photos/3f1c2b9e-0d4a-4c6b-9a51-2e7f8c0d1a23?edit=1')
  })

  it('keeps an odd id inside the path segment', () => {
    expect(editHref('a/b?c')).toBe('/photos/a%2Fb%3Fc?edit=1')
  })
})

describe('opensEdit', () => {
  it('opens only for ?edit=1', () => {
    expect(opensEdit('1')).toBe(true)
    expect(opensEdit(undefined)).toBe(false)
    expect(opensEdit('0')).toBe(false)
    expect(opensEdit(['1', '1'])).toBe(false)
  })
})
