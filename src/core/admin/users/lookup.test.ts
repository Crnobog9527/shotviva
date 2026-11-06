import { describe, expect, it } from 'vitest'

import { parseClusterWindow } from './clusters'
import { lookupHref } from './lookup'

describe('lookupHref', () => {
  it('opens the user, with the job highlighted when the query was a job id', () => {
    const userId = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
    expect(lookupHref({ kind: 'checkout', userId, jobId: null })).toBe(`/admin/users/${userId}`)
    expect(lookupHref({ kind: 'job', userId, jobId: 'j1' })).toBe(`/admin/users/${userId}?job=j1`)
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
