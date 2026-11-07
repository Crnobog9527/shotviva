import { describe, expect, it } from 'vitest'

import { isMissingFunction, planInterval } from './list'

describe('planInterval (T77)', () => {
  it('reads monthly or yearly off the product id', () => {
    expect(planInterval('starter_monthly')).toBe('month')
    expect(planInterval('max_yearly')).toBe('year')
    expect(planInterval('pack_100')).toBeNull()
    expect(planInterval(null)).toBeNull()
  })
})

describe('isMissingFunction (T77)', () => {
  it('recognises a database without admin_list_users, and nothing else', () => {
    expect(isMissingFunction({ code: 'PGRST202', message: 'Could not find the function public.admin_list_users' })).toBe(true)
    expect(isMissingFunction({ code: '42883', message: 'function does not exist' })).toBe(true)
    expect(isMissingFunction({ code: '22023', message: 'INVALID_INPUT' })).toBe(false)
  })
})
