import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { startPaymentFees } from './payment-fees-start'

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const dbAnswering = (answer: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(answer)
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}
const filled = { confirm: 'on', expected_record_from: '', expected_terms_version: '2026-11-10' }

describe('startPaymentFees (fee go-live)', () => {
  it('needs the confirmation box and never calls the database without it', async () => {
    const { db, rpc } = dbAnswering({ data: null, error: null })
    expect(await startPaymentFees(db, 'admin', form({ expected_terms_version: '2026-11-10' }), '2026-11-21')).toBe('feesConfirmMissing')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('switches to the newest terms the server knows, with what the page showed as expected values', async () => {
    const { db, rpc } = dbAnswering({ data: { applied: true }, error: null })
    expect(await startPaymentFees(db, 'admin', form({ ...filled, terms_version: 'forged' }), '2026-11-21')).toBe('feesStarted')
    expect(rpc).toHaveBeenCalledWith('admin_payment_fees_start', {
      p_actor: 'admin', p_input: { terms_version: '2026-11-21', expected_record_from: null, expected_terms_version: '2026-11-10' },
    })
  })
  it('maps the database answers', async () => {
    expect(await startPaymentFees(dbAnswering({ data: { applied: false, reason: 'already' }, error: null }).db, 'a', form(filled), '2026-11-21')).toBe('feesAlreadyStarted')
    expect(await startPaymentFees(dbAnswering({ data: null, error: { message: 'PAYMENT_FEES_START_CHANGED' } }).db, 'a', form(filled), '2026-11-21')).toBe('feesStartChanged')
    expect(await startPaymentFees(dbAnswering({ data: null, error: { message: 'PAYMENT_FEES_ALREADY_STARTED' } }).db, 'a', form(filled), '2026-11-21')).toBe('feesStartedOther')
    await expect(startPaymentFees(dbAnswering({ data: null, error: { message: 'NOT_ADMIN' } }).db, 'a', form(filled), '2026-11-21')).rejects.toThrow()
  })
})
