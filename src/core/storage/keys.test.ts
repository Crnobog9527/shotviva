import { describe, expect, it } from 'vitest'

import { contentTypeOfKey, inputPreviewKeyFor, isKeptInputKey, isOwnInputKey, keptInputKeyFor, newInputKey, newRequestImageKey, outputKeyFor } from './keys'

const USER = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
const OTHER = '7d1e2c3b-0000-4000-8000-000000000000'

describe('storage keys', () => {
  it('puts inputs and outputs under the owner prefix', () => {
    expect(newInputKey(USER, 'image/jpeg')).toMatch(new RegExp(`^inputs/${USER}/[0-9a-f-]{36}\\.jpg$`))
    expect(newInputKey(USER, 'image/webp')).toMatch(/\.webp$/)
    expect(outputKeyFor(USER, 'job-1')).toBe(`outputs/${USER}/job-1.png`)
    // Under outputs/{user}/ so account deletion's prefix sweep takes it with the result.
    expect(inputPreviewKeyFor(USER, 'job-1')).toBe(`outputs/${USER}/job-1-input.webp`)
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

  it('keeps a job’s uploads under its own outputs/ slot, extension and all (T40)', () => {
    const job = '5c0d9a8e-1111-4222-8333-444455556666'
    const upload = newInputKey(USER, 'image/jpeg')
    const kept = keptInputKeyFor(USER, job, 1, upload)
    expect(kept).toBe(`outputs/${USER}/${job}-in-1.jpg`)
    expect(keptInputKeyFor(USER, job, 2, newInputKey(USER, 'image/png'))).toBe(`outputs/${USER}/${job}-in-2.png`)
    expect(isKeptInputKey(USER, job, kept)).toBe(true)
    expect(isKeptInputKey(OTHER, job, kept)).toBe(false)
    expect(isKeptInputKey(USER, '00000000-0000-4000-8000-000000000000', kept)).toBe(false)
    expect(isKeptInputKey(USER, job, `outputs/${USER}/${job}.png`)).toBe(false)
    expect(isKeptInputKey(USER, job, `outputs/${USER}/${job}-input.webp`)).toBe(false)
    expect(contentTypeOfKey(kept)).toBe('image/jpeg')
    expect(contentTypeOfKey('outputs/x/y.gif')).toBeNull()
  })
})
