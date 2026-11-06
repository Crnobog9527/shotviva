import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { listMonthWorks } from './own-jobs'

// The account film strip's read (T48): this UTC month's finished, not deleted works, newest
// first, a few ids plus the total, in one query.

function recorder(rows: { id: string }[], count: number | null) {
  const calls: unknown[][] = []
  const chain: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'is', 'gte', 'order']) {
    chain[name] = (...args: unknown[]) => {
      calls.push([name, ...args])
      return chain
    }
  }
  chain.limit = async (n: number) => {
    calls.push(['limit', n])
    return { data: rows, error: null, count }
  }
  const client = { from: (table: string) => (calls.push(['from', table]), chain) } as unknown as SupabaseClient
  return { client, calls }
}

describe('listMonthWorks', () => {
  it('asks for this month succeeded, undeleted works with an exact count', async () => {
    const { client, calls } = recorder([{ id: 'j2' }, { id: 'j1' }], 12)
    const result = await listMonthWorks(client, 'u1', new Date('2026-11-06T20:00:00Z'), 7)
    expect(result).toEqual({ ids: ['j2', 'j1'], count: 12 })
    expect(calls).toEqual([
      ['from', 'generation_jobs'],
      ['select', 'id', { count: 'exact' }],
      ['eq', 'user_id', 'u1'],
      ['eq', 'status', 'succeeded'],
      ['is', 'deleted_at', null],
      ['gte', 'created_at', '2026-11-01T00:00:00.000Z'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 7],
    ])
  })

  it('falls back to the rows it got when no count comes back', async () => {
    const { client } = recorder([{ id: 'j1' }], null)
    expect(await listMonthWorks(client, 'u1', new Date('2026-01-31T23:59:00Z'), 7)).toEqual({ ids: ['j1'], count: 1 })
  })
})
