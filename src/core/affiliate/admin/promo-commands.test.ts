import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { decidePromo, runPromoNow, setPromoPartner, voidPromo } from './promo-commands'
import { PROMO_COPY as P } from './promo-copy'

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
const fp = '0123456789abcdef0123456789abcdef'
const confirm = { operation: 'promoDecide', grant_id: '7', decision: 'confirm', fingerprint: fp }

describe('decidePromo', () => {
  it('sends the decision with the fingerprint the page showed and reports the grant', async () => {
    const { db, rpc } = dbAnswering({ data: { applied: true, grant_id: 7, total: 40000 }, error: null })
    expect(await decidePromo(db, 'admin', form(confirm))).toBe(P.answers.granted)
    expect(rpc).toHaveBeenCalledWith('admin_partner_promo_decide', { p_actor: 'admin', p_input: { grant_id: '7', decision: 'confirm', fingerprint: fp } })
  })

  it('tells a stale page and a double confirm apart from a grant', async () => {
    expect(await decidePromo(dbAnswering({ data: { applied: false, reason: 'changed' }, error: null }).db, 'a', form(confirm))).toBe(P.answers.changed)
    expect(await decidePromo(dbAnswering({ data: { applied: false, reason: 'already' }, error: null }).db, 'a', form(confirm))).toBe(P.answers.already)
  })

  it('maps refusals and checks the form before calling the database', async () => {
    expect(await decidePromo(dbAnswering({ data: null, error: { message: 'PROMO_GRANT_EXPIRED' } }).db, 'a', form(confirm))).toBe(P.answers.expired)
    expect(await decidePromo(dbAnswering({ data: null, error: { message: 'PROMO_PARTNER_OFF' } }).db, 'a', form(confirm))).toBe(P.answers.partnerOff)
    const { db, rpc } = dbAnswering({ data: null, error: null })
    expect(await decidePromo(db, 'a', form({ grant_id: '7', decision: 'reject', note: '  ' }))).toBe(P.answers.noteMissing)
    expect(await decidePromo(db, 'a', form({ grant_id: 'x', decision: 'confirm' }))).toBe(P.answers.invalid)
    expect(await decidePromo(db, 'a', form({ grant_id: '7', decision: 'send' }))).toBe(P.answers.invalid)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('throws an unexpected database error for the action to log', async () => {
    await expect(decidePromo(dbAnswering({ data: null, error: { message: 'boom' } }).db, 'a', form(confirm))).rejects.toThrow()
  })
})

describe('voidPromo', () => {
  const voiding = { operation: 'promoVoid', grant_id: '1', reason: ' 已手动收回 ' }

  it('sends the grant and the trimmed reason, and tells a first void from a repeat', async () => {
    const { db, rpc } = dbAnswering({ data: { applied: true, grant_id: 1 }, error: null })
    expect(await voidPromo(db, 'admin', form(voiding))).toBe(P.answers.voided)
    expect(rpc).toHaveBeenCalledWith('admin_partner_promo_void', { p_actor: 'admin', p_input: { grant_id: '1', reason: '已手动收回' } })
    expect(await voidPromo(dbAnswering({ data: { applied: false, reason: 'already', grant_id: 1 }, error: null }).db, 'a', form(voiding)))
      .toBe(P.answers.alreadyVoided)
  })

  it('requires a reason, checks the form before calling the database and maps refusals', async () => {
    const { db, rpc } = dbAnswering({ data: null, error: null })
    expect(await voidPromo(db, 'a', form({ grant_id: '1', reason: '   ' }))).toBe(P.answers.voidReasonMissing)
    expect(await voidPromo(db, 'a', form({ grant_id: '1' }))).toBe(P.answers.voidReasonMissing)
    expect(await voidPromo(db, 'a', form({ grant_id: '0', reason: 'x' }))).toBe(P.answers.invalid)
    expect(rpc).not.toHaveBeenCalled()
    expect(await voidPromo(dbAnswering({ data: null, error: { message: 'PROMO_GRANT_NOT_GRANTED' } }).db, 'a', form(voiding))).toBe(P.answers.notGranted)
    expect(await voidPromo(dbAnswering({ data: null, error: { message: 'PROMO_GRANT_EXPIRED' } }).db, 'a', form(voiding))).toBe(P.answers.voidExpired)
    await expect(voidPromo(dbAnswering({ data: null, error: { message: 'NOT_ADMIN' } }).db, 'a', form(voiding))).rejects.toThrow()
  })
})

describe('setPromoPartner and runPromoNow', () => {
  it('switches a partner on and explains an org without the affiliate switch', async () => {
    const org = '6a1f0c2e-0d5b-4f6a-9c1e-2b3d4e5f6a7b'
    const { db, rpc } = dbAnswering({ data: true, error: null })
    expect(await setPromoPartner(db, 'a', form({ org_id: org, on: 'true' }))).toBe(P.marked)
    expect(rpc).toHaveBeenCalledWith('admin_partner_promo_set', { p_actor: 'a', p_input: { org_id: org, on: true } })
    expect(await setPromoPartner(dbAnswering({ data: null, error: { message: 'PROMO_PARTNER_NEEDS_AFFILIATE' } }).db, 'a', form({ org_id: org, on: 'true' })))
      .toBe(P.needsAffiliate)
  })

  it('reports how many sheets the run wrote, or that some partners failed', async () => {
    expect(await runPromoNow(dbAnswering({ data: { sheets: 2, pending: 2, failed_orgs: [] }, error: null }).db, 'a')).toBe(P.ran(2, 2))
    expect(await runPromoNow(dbAnswering({ data: { sheets: 1, pending: 1, failed_orgs: [{}] }, error: null }).db, 'a')).toBe(P.runFailed(1))
  })
})
