import { describe, expect, it } from 'vitest'

import { parseClusterWindow } from './clusters'
import type { SupabaseClient } from '@supabase/supabase-js'

import { lookupHref, lookupUser } from './lookup'

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

  it('lists the jobs when several share the reference number typed', () => {
    expect(lookupHref({ kind: 'jobs', ref: '2fa821c6' }, { q: '2fa821c6' })).toBe('/admin/jobs?ref=2fa821c6')
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

// admin_lookup answers `rpcRows`; the job-number range query answers `jobRows`.
function fakeDb(rpcRows: unknown[], jobRows: { id: string; user_id: string }[]) {
  const calls: string[] = []
  const range = { gte: () => range, lte: () => range, order: () => range, limit: () => Promise.resolve({ data: jobRows, error: null }) }
  const db = {
    rpc: () => {
      calls.push('admin_lookup')
      return Promise.resolve({ data: rpcRows, error: null })
    },
    from: () => {
      calls.push('jobs')
      return { select: () => range }
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

describe('lookupUser and job numbers (T78)', () => {
  const userId = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'
  const jobId = '2fa821c6-1a2b-4c3d-8e4f-000000000001'

  it('finds an account first: an all-digit email fragment is not taken for a job number', async () => {
    const { db, calls } = fakeDb([{ kind: 'email', user_id: userId, job_id: null }], [{ id: jobId, user_id: userId }])
    expect(await lookupUser(db, '12345678')).toEqual({ kind: 'email', userId, jobId: null })
    expect(calls).toEqual(['admin_lookup'])
  })

  it('falls back to the job number when admin_lookup finds nothing', async () => {
    const { db, calls } = fakeDb([], [{ id: jobId, user_id: userId }])
    expect(await lookupUser(db, '2fa821c6')).toEqual({ kind: 'job', userId, jobId })
    expect(calls).toEqual(['admin_lookup', 'jobs'])
  })

  it('lists the jobs when several share the number, and finds nothing for a non-hex query', async () => {
    const two = [{ id: jobId, user_id: userId }, { id: '2fa821c6-ffff-4c3d-8e4f-000000000002', user_id: userId }]
    expect(await lookupUser(fakeDb([], two).db, '2FA821C6')).toEqual({ kind: 'jobs', ref: '2fa821c6' })
    const { db, calls } = fakeDb([], two)
    expect(await lookupUser(db, 'someone@x')).toBeNull()
    expect(calls).toEqual(['admin_lookup'])
  })
})
