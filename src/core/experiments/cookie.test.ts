import { describe, expect, it } from 'vitest'

import { parseExperimentCookie, serializeExperimentCookie } from './cookie'

describe('experiment cookie', () => {
  it('round-trips entries with and without flags', () => {
    const value = '3.11.10.r~4.20.20'
    const entries = parseExperimentCookie(value)
    expect([...entries.values()]).toEqual([
      { experiment: 3, current: 11, first: 10, flag: 'r' },
      { experiment: 4, current: 20, first: 20, flag: '' },
    ])
    expect(serializeExperimentCookie(entries.values())).toBe(value)
  })

  it('skips anything malformed and caps the entries', () => {
    expect(parseExperimentCookie('x~3.1~3.1.1.z~<script>').size).toBe(0)
    expect(parseExperimentCookie(undefined).size).toBe(0)
    const many = Array.from({ length: 30 }, (_, i) => `${i + 1}.1.1`).join('~')
    expect(parseExperimentCookie(many).size).toBe(12)
  })
})
