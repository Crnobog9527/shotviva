import { describe, expect, it } from 'vitest'

import { parseClusterWindow } from './clusters'
import { lookupHref } from './lookup'

describe('lookupHref', () => {
  const userId = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'

  it('opens the user dialog on the list, with the job highlighted when the query was a job id', () => {
    expect(lookupHref({ kind: 'checkout', userId, jobId: null }, { q: 'cs_test_1', tier: 'max' })).toBe(`/admin/users?tier=max&user=${userId}`)
    expect(lookupHref({ kind: 'job', userId, jobId: 'j1' }, { q: 'j1' })).toBe(`/admin/users?user=${userId}&userJob=j1`)
  })

  it('keeps an email query so the list behind the dialog shows that account', () => {
    expect(lookupHref({ kind: 'email', userId, jobId: null }, { q: 'alice@' })).toBe(`/admin/users?q=alice%40&user=${userId}`)
    // No lookup flag in the result: a refresh or closing the dialog does not run the lookup again.
    expect(lookupHref({ kind: 'email', userId, jobId: null }, { q: 'alice@' })).not.toContain('lookup')
  })
})

describe('parseClusterWindow', () => {
  it('is 24 hours unless 7 days is asked for', () => {
    expect(parseClusterWindow('7')).toBe(7)
    expect(parseClusterWindow('1')).toBe(1)
    expect(parseClusterWindow('30')).toBe(1)
    expect(parseClusterWindow(undefined)).toBe(1)
  })
})
