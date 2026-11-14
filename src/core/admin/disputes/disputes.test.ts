import { describe, expect, it } from 'vitest'

import type { LiveDispute } from '@/core/billing/stripe'

import { daysLeft, toCard } from '../disputes-ui/view-model'
import { sniffEvidenceFile } from './commands'
import { reminderCandidates } from './reminders'
import type { DisputeListItem } from './repository'

// T82: the admin 「拒付」 page's pure parts.

const now = new Date('2026-11-08T00:00:00Z')
const day = 24 * 60 * 60 * 1000

const live = (over: Partial<LiveDispute> = {}): LiveDispute => ({
  id: 'dp_1',
  status: 'needs_response',
  dueBy: new Date(now.getTime() + 2 * day),
  submissionCount: 0,
  hasEvidence: true,
  open: true,
  text: {},
  files: {},
  ...over,
})

const item = (over: Partial<DisputeListItem> = {}): DisputeListItem => ({
  stripe_dispute_id: 'dp_1',
  stripe_charge_id: 'ch_1',
  payment_id: 1,
  user_id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  product_id: 'pro_monthly',
  amount: 1990,
  currency: 'usd',
  reason: 'fraudulent',
  responder: 'shotviva',
  due_by: new Date(now.getTime() + 2 * day),
  auto_banned_at: now,
  evidence_drafted_at: now,
  submitted_at: null,
  reminded_at: null,
  created_at: now,
  live: live(),
  ...over,
})

describe('reminderCandidates', () => {
  it('picks only our unsubmitted, unreminded disputes Stripe still needs, due within 3 days', () => {
    const items = [
      item({ stripe_dispute_id: 'dp_due' }),
      item({ stripe_dispute_id: 'dp_far', live: live({ dueBy: new Date(now.getTime() + 5 * day) }) }),
      item({ stripe_dispute_id: 'dp_stripe', responder: 'stripe' }),
      item({ stripe_dispute_id: 'dp_sent', submitted_at: now }),
      item({ stripe_dispute_id: 'dp_reminded', reminded_at: now }),
      item({ stripe_dispute_id: 'dp_dashboard', live: live({ open: false, status: 'under_review' }) }),
      item({ stripe_dispute_id: 'dp_unknown', live: null }),
    ]
    expect(reminderCandidates(items, now)).toEqual(['dp_due'])
  })
})

describe('toCard', () => {
  it('marks a dispute we must still submit as urgent, with days left', () => {
    expect(toCard(item(), now)).toMatchObject({ amount: 'US$19.90', reason: '盗刷 / 非本人交易', status: '待提交证据', tone: 'urgent', daysLeft: '还剩 2 天', banned: true, responder: '我们提交' })
  })

  it('a Managed Payments dispute is never urgent; a closed one shows no countdown', () => {
    expect(toCard(item({ responder: 'stripe' }), now).tone).toBe('waiting')
    expect(toCard(item({ live: live({ status: 'won', open: false }) }), now)).toMatchObject({ tone: 'done', status: '胜诉', daysLeft: null })
  })

  it('falls back to our row when Stripe cannot be read', () => {
    expect(toCard(item({ live: null, submitted_at: now }), now).status).toBe('已提交')
    expect(toCard(item({ email: null, user_id: null }), now).user).toBe('（账号已删除或付款不在表里）')
  })
})

describe('daysLeft', () => {
  it('counts whole days up, says today and expired', () => {
    expect(daysLeft(new Date(now.getTime() + 1.2 * day), now)).toBe('还剩 2 天')
    expect(daysLeft(now, now)).toBe('今天截止')
    expect(daysLeft(new Date(now.getTime() - day), now)).toBe('已过期')
    expect(daysLeft(null, now)).toBeNull()
  })
})

describe('sniffEvidenceFile', () => {
  it('knows PDF, PNG and JPEG by their bytes and nothing else', () => {
    expect(sniffEvidenceFile(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf')
    expect(sniffEvidenceFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png')
    expect(sniffEvidenceFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffEvidenceFile(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull()
  })
})
