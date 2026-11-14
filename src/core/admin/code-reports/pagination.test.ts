import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'

import { PAGE_SIZE } from '../cursor'
import { redemptions, reportCursor } from './queries'

const code = 'e932b7d8-0fe7-4100-9420-07c4ea81872a'
const row = {
  id: '305789df-72bf-47e0-99d3-ba1bf114f265', code_id: code, code: 'QA20',
  created_at: '2026-11-09T18:00:00.123456+00:00', user_id: code, inviter_user_id: null,
  context: 'account', status: 'ok', credits_granted: 0, inviter_reward_payment_id: null, inviter_rewarded_at: null,
  discount_used_payment_id: null, discount_void_at: null, discount_expires_at: null, discount_conflict_payments: [],
  reward_payment_status: null, reward_payment_refunded: null,
}
function fixture(hasNext: boolean) {
  const where = vi.fn().mockResolvedValue({ data: hasNext ? [{ id: code }] : [], error: null })
  const probe = { or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), eq: where }
  const rpc = vi.fn().mockResolvedValue({ data: Array(PAGE_SIZE).fill(row), error: null })
  const db = { from: () => ({ select: () => probe }), rpc } as unknown as SupabaseClient
  return { db, rpc, where }
}

it('continues a full report page only when more of the same code exist', async () => {
  for (const hasNext of [true, false]) {
    const { db, rpc, where } = fixture(hasNext)
    const { items, nextCursor } = await redemptions(db, 'actor', code)
    expect(items).toHaveLength(PAGE_SIZE)
    expect(rpc).toHaveBeenCalledWith('admin_code_redemptions', { p_actor: 'actor', p_cursor: null, p_code_id: code })
    expect(where).toHaveBeenCalledWith('code_id', code)
    expect(reportCursor(nextCursor ?? undefined)).toEqual(hasNext ? { id: row.id, created_at: row.created_at } : null)
  }
})

it('limits the cross-code next-page probe to the blocked-IP cohort', async () => {
  const { db, where } = fixture(false)
  await redemptions(db, 'actor', null)
  expect(where).toHaveBeenCalledWith('status', 'blocked_same_ip')
})
