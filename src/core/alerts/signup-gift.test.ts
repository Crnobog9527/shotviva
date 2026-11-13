import { describe, expect, it } from 'vitest'

import { alertPolicy } from './alert-kinds'
import { beijingDay, signupGiftAlert } from './signup-gift'
import { renderAlert } from './templates'

// 2026-11-13 16:30 UTC is 2026-11-14 00:30 in Beijing: the cap's day is Beijing's.
const NOW = Date.UTC(2026, 10, 13, 16, 30)

describe('signupGiftAlert (1350)', () => {
  it('stays quiet under half, while paused, and with no gift at all', () => {
    expect(signupGiftAlert({ granted: 14, cap: 30, paused: false }, NOW)).toBeNull()
    expect(signupGiftAlert({ granted: 30, cap: 30, paused: true }, NOW)).toBeNull()
    expect(signupGiftAlert({ granted: 0, cap: 0, paused: false }, NOW)).toBeNull()
  })

  it('says half at half and full at the cap, keyed by the Beijing day', () => {
    const half = signupGiftAlert({ granted: 15, cap: 30, paused: false }, NOW)
    const full = signupGiftAlert({ granted: 30, cap: 30, paused: false }, NOW)
    expect(half).toEqual({ kind: 'signup_gift_cap', day: '2026-11-14', level: 'half', granted: 15, cap: 30 })
    expect(full?.level).toBe('full')
    expect(beijingDay(NOW)).toBe('2026-11-14')
    // Once per day and level: later accounts that day build the same key.
    expect(alertPolicy(half!).key).toBe('signup_gift_cap:2026-11-14:half')
    expect(alertPolicy({ ...half!, granted: 16 }).key).toBe(alertPolicy(half!).key)
    expect(alertPolicy(full!).money).toBe(false)
  })

  it('renders plain Chinese with the admin link', () => {
    const full = signupGiftAlert({ granted: 30, cap: 30, paused: false }, NOW)!
    const { sentence, link } = renderAlert(full, { who: '', origin: 'https://shotviva.com', testSite: false })
    expect(sentence).toContain('注册赠送已满')
    expect(sentence).toContain('30 份')
    expect(link).toContain('/admin/features')
  })
})
