import { describe, expect, it } from 'vitest'

import { isOwnInputKey, newInputKey, newRequestImageKey, outputKeyFor } from './keys'

const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
const OTHER = '7d1e2c3b-0000-4000-8000-000000000000'

describe('storage keys', () => {
  it('puts inputs and outputs under the owner prefix', () => {
    expect(newInputKey(USER, 'image/jpeg')).toMatch(new RegExp(`^inputs/${USER}/[0-9a-f-]{36}\\.jpg$`))
    expect(newInputKey(USER, 'image/webp')).toMatch(/\.webp$/)
    expect(outputKeyFor(USER, 'job-1')).toBe(`outputs/${USER}/job-1.png`)
    expect(newRequestImageKey(USER)).toMatch(new RegExp(`^requests/${USER}/[0-9a-f-]{36}\\.jpg$`))
  })

  it('accepts only the caller’s own server-shaped input keys', () => {
    const key = newInputKey(USER, 'image/png')
    expect(isOwnInputKey(USER, key)).toBe(true)
    expect(isOwnInputKey(OTHER, key)).toBe(false)
    expect(isOwnInputKey(USER, `outputs/${USER}/x.png`)).toBe(false)
    expect(isOwnInputKey(USER, `inputs/${USER}/../${OTHER}/a.jpg`)).toBe(false)
    expect(isOwnInputKey(USER, `inputs/${USER}/not-a-uuid.jpg`)).toBe(false)
  })
})
