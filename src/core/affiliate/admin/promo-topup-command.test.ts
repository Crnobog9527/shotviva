import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { topupPromo } from './promo-topup-command'
import { TOPUP_COPY as T } from './promo-topup-copy'

vi.mock('server-only', () => ({}))

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const dbAnswering = (answer: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(answer)
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}
const fields = {
  operation: 'promoTopup',
  org_id: '0b6f0a6e-2b1e-4c55-9a3e-0f1f3d6c9a11',
  recipient: '5d3c1c9e-8e1f-4b7e-a2f0-5a9e0c3b7d22',
  period: '2026-11',
  credits: '5000',
  reason: '  first month  ',
  request_key: '9a1d2c3b-4e5f-4a6b-8c7d-1e2f3a4b5c66',
}

describe('topupPromo', () => {
  it('sends the form as shown, with its request key, and reports the top-up', async () => {
    const { db, rpc } = dbAnswering({ data: { applied: true, topup_id: 3, credits: 5000 }, error: null })
    expect(await topupPromo(db, 'admin', form(fields))).toBe(T.answers.granted)
    const input = { org_id: fields.org_id, recipient: fields.recipient, period: fields.period, credits: '5000', reason: 'first month', request_key: fields.request_key }
    expect(rpc).toHaveBeenCalledWith('admin_partner_promo_topup', { p_actor: 'admin', p_input: input })
  })

  it('tells a double submit and a stale form apart from a top-up', async () => {
    expect(await topupPromo(dbAnswering({ data: { applied: false, reason: 'already' }, error: null }).db, 'a', form(fields))).toBe(T.answers.already)
    expect(await topupPromo(dbAnswering({ data: { applied: false, reason: 'changed' }, error: null }).db, 'a', form(fields))).toBe(T.answers.changed)
    expect(await topupPromo(dbAnswering({ data: null, error: { message: 'PROMO_PARTNER_OFF' } }).db, 'a', form(fields))).toBe(T.answers.partnerOff)
    expect(await topupPromo(dbAnswering({ data: null, error: { message: 'IDEMPOTENCY_CONFLICT' } }).db, 'a', form(fields))).toBe(T.answers.invalid)
  })

  it('checks the amount, the reason and the key before calling the database', async () => {
    const { db, rpc } = dbAnswering({ data: null, error: null })
    expect(await topupPromo(db, 'a', form({ ...fields, reason: '   ' }))).toBe(T.answers.reasonMissing)
    expect(await topupPromo(db, 'a', form({ ...fields, credits: '100001' }))).toBe(T.answers.tooMany)
    for (const credits of ['0', '-5', '1.5', '1e3', '']) expect(await topupPromo(db, 'a', form({ ...fields, credits }))).toBe(T.answers.invalid)
    expect(await topupPromo(db, 'a', form({ ...fields, request_key: '' }))).toBe(T.answers.invalid)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('throws on an unexpected database error so the action logs it', async () => {
    await expect(topupPromo(dbAnswering({ data: null, error: { message: 'boom' } }).db, 'a', form(fields))).rejects.toThrow()
  })
})
