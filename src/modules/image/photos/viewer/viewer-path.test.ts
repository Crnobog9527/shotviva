import { describe, expect, it } from 'vitest'

import { opensEditFrom, stepFrom, workIdOf, workPath } from './viewer-path'

const ID = '0b6c7d2e-1f3a-4b5c-8d9e-0a1b2c3d4e5f'

describe('viewer path', () => {
  it('reads a work id only from /photos/<uuid>', () => {
    expect(workIdOf(`/photos/${ID}`)).toBe(ID)
    expect(workIdOf(`/photos/${ID.toUpperCase()}/`)).toBe(ID)
    expect(workIdOf('/photos')).toBeNull()
    expect(workIdOf('/photos/not-a-work')).toBeNull()
    expect(workIdOf(`/generate/${ID}`)).toBeNull()
  })

  it('builds the work and list paths', () => {
    expect(workPath(ID)).toBe(`/photos/${ID}`)
    expect(workPath(null)).toBe('/photos')
  })

  it('opens the edit form only for ?edit=1', () => {
    expect(opensEditFrom('?edit=1')).toBe(true)
    expect(opensEditFrom('?edit=0')).toBe(false)
    expect(opensEditFrom('')).toBe(false)
  })

  it('steps through the list and stops at the ends', () => {
    const ids = ['a', 'b', 'c']
    expect(stepFrom(ids, 'b', 1)).toBe('c')
    expect(stepFrom(ids, 'b', -1)).toBe('a')
    expect(stepFrom(ids, 'c', 1)).toBeNull()
    expect(stepFrom(ids, 'a', -1)).toBeNull()
    expect(stepFrom(ids, 'z', 1)).toBeNull()
    expect(stepFrom(ids, null, 1)).toBeNull()
  })
})
