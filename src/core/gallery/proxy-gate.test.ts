import { describe, expect, it } from 'vitest'

import { galleryWorkIdOf } from './proxy-gate'

const id = '0b6f2f8e-6a3f-4c1e-9d55-1f2a3b4c5d6e'

describe('galleryWorkIdOf', () => {
  it('finds the work id of a /g address in either language', () => {
    expect(galleryWorkIdOf(`/g/${id}`)).toBe(id)
    expect(galleryWorkIdOf(`/zh/g/${id}/`)).toBe(id)
  })

  it('marks a malformed id, and ignores other paths', () => {
    expect(galleryWorkIdOf('/g/not-a-uuid')).toBe('')
    expect(galleryWorkIdOf(`/g/${id}/extra`)).toBeNull()
    expect(galleryWorkIdOf('/gallery')).toBeNull()
    expect(galleryWorkIdOf(`/generate/${id}`)).toBeNull()
  })
})
