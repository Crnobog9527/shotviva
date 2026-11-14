import { describe, expect, it } from 'vitest'
import { templateFieldsSchema } from '@/core/templates/schema'
import { ratiosLocked, withRatiosLocked } from './lock-ratios'

const json = JSON.stringify({ images: { min: 1, max: 1 }, aspectRatios: ['2:3'] }, null, 2)

describe('the 锁定比例 checkbox', () => {
  it('writes the flag into the fields JSON and removes it again', () => {
    expect(ratiosLocked(json)).toBe(false)
    const on = withRatiosLocked(json, true)
    expect(ratiosLocked(on)).toBe(true)
    expect(JSON.parse(on)).toEqual({ images: { min: 1, max: 1 }, aspectRatios: ['2:3'], lockAspectRatios: true })
    expect(withRatiosLocked(on, false)).toBe(json)
  })

  it('is unavailable while the JSON does not parse, and leaves the text alone', () => {
    expect(ratiosLocked('{ broken')).toBeNull()
    expect(withRatiosLocked('{ broken', true)).toBe('{ broken')
  })

  it('survives the server-side fields schema', () => {
    const parsed = templateFieldsSchema.parse(JSON.parse(withRatiosLocked(json, true)))
    expect(parsed.lockAspectRatios).toBe(true)
  })
})
