import { describe, expect, it } from 'vitest'

import { phoneKey } from './phone-key'
import { maskPhone, parseMainlandPhone, parseStoredPhone } from './phone-number'

// T63: +86 mainland mobile numbers only (ARCHITECTURE §7). Numbers here are made up.
const want = { e164: '+8614000000001', digits: '8614000000001', national: '14000000001' }

describe('parseMainlandPhone', () => {
  it.each(['14000000001', ' 140 0000 0001 ', '140-0000-0001', '+8614000000001', '+86 140 0000 0001', '008614000000001', '8614000000001'])(
    'reads %j as a mainland number',
    (input) => expect(parseMainlandPhone(input)).toEqual(want),
  )

  it.each(['+14155550123', '+85291234567', '+886912345678', '12000000001', '1400000000', '140000000012', '+8612000000001', 'abc', '', null, undefined])(
    'refuses %j (not +86 mobile)',
    (input) => expect(parseMainlandPhone(input)).toBeNull(),
  )
})

describe('parseStoredPhone (auth.users.phone, the hook payload)', () => {
  it('takes the digits Supabase stores and nothing else', () => {
    expect(parseStoredPhone('8614000000001')).toEqual(want)
    expect(parseStoredPhone('14155550123')).toBeNull()
    expect(parseStoredPhone('85291234567')).toBeNull()
    expect(parseStoredPhone('')).toBeNull()
    expect(parseStoredPhone(null)).toBeNull()
  })
})

describe('maskPhone', () => {
  it('shows the first three and last four digits only', () => {
    expect(maskPhone('8614000005678')).toBe('140****5678')
    expect(maskPhone('+8614000005678')).toBe('140****5678')
    expect(maskPhone(null)).toBe('')
    expect(maskPhone('14155550123')).toBe('')
  })
})

describe('phoneKey', () => {
  it('is a sha256 hex of the digits, the same for every spelling of one number', () => {
    const key = phoneKey(want)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain('14000000001')
    expect(phoneKey(parseMainlandPhone('+86 140 0000 0001')!)).toBe(key)
  })
})
