import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { readImageProviderQuote } from './provider-pricing'
import { listAdminTemplates } from './repository'
import { retryStatementTimeout, STATEMENT_TIMEOUT } from './timeout-retry'

// After a template save, refresh() re-renders the editor; a read caught in one of the test
// database's 10-20 s stalls hit the 8 s statement timeout and the editor showed a load error
// although the save had gone through (PR #963 validation, 2026-11-27). Those reads try once more.

const timeout = { data: null, error: { code: STATEMENT_TIMEOUT, message: 'canceling statement due to statement timeout' } }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('retryStatementTimeout', () => {
  it('reads again once after a pause on a statement timeout, never on other errors or a success', async () => {
    const read = vi.fn().mockResolvedValueOnce(timeout).mockResolvedValueOnce({ data: 1, error: null })
    const done = retryStatementTimeout(read)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(await done).toEqual({ data: 1, error: null })
    expect(read).toHaveBeenCalledTimes(2)

    const other = vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
    expect((await retryStatementTimeout(other)).error?.code).toBe('42501')
    expect(other).toHaveBeenCalledTimes(1)

    const twice = vi.fn().mockResolvedValue(timeout)
    const failed = retryStatementTimeout(twice)
    await vi.advanceTimersByTimeAsync(1_500)
    expect((await failed).error?.code).toBe(STATEMENT_TIMEOUT)
    expect(twice).toHaveBeenCalledTimes(2)
  })
})

function chain(result: () => unknown) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'neq', 'order', 'limit', 'gt', 'eq']) q[name] = () => q
  q.returns = () => Promise.resolve(result())
  q.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject)
  return q
}

describe('the editor reads after a save', () => {
  it('the template list survives one statement timeout', async () => {
    let templateReads = 0
    const client = {
      from: (table: string) => chain(() => {
        if (table !== 'templates') return { data: [], error: null }
        templateReads++
        return templateReads === 1 ? timeout : { data: [], error: null }
      }),
      rpc: () => chain(() => ({ data: [], error: null })),
    } as unknown as SupabaseClient
    const list = listAdminTemplates(client)
    await vi.advanceTimersByTimeAsync(1_500)
    await expect(list).resolves.toEqual([])
    expect(templateReads).toBe(2)
  })

  it('the image cost quote survives one statement timeout', async () => {
    const ok = { error: null, data: { input: { version: 'v2', unit_price: 0.01, providers: [] }, receipt: { terms: 't', routes: {}, active: 'x' } } }
    const rpc = vi.fn().mockResolvedValueOnce(timeout).mockResolvedValueOnce(ok)
    const quote = readImageProviderQuote({ rpc } as unknown as SupabaseClient, 1, 'env-model')
    await vi.advanceTimersByTimeAsync(1_500)
    expect((await quote).options).toEqual([])
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
