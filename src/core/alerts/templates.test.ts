import { describe, expect, it } from 'vitest'

import type { OwnerAlert } from './alert-kinds'
import { renderAlert, type RenderContext } from './templates'

const USER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const TICKET = '0b1c2d3e-4f50-4a6b-8c7d-8e9f0a1b2c3d'
const usd = (cents: number) => ({ cents, currency: 'usd' })
const ctx: RenderContext = { who: 'j***@gmail.com', origin: 'https://shotviva.com', testSite: false }

const text = (alert: OwnerAlert, over: Partial<RenderContext> = {}) => {
  const { sentence, link } = renderAlert(alert, { ...ctx, ...over })
  return `${sentence}\n${link}`
}

const refund = (over: Partial<Extract<OwnerAlert, { kind: 'refund' }>> = {}): OwnerAlert => ({
  kind: 'refund',
  channel: 'stripe',
  refundId: 'ch_1',
  userId: USER,
  productId: 'pro_monthly',
  amount: usd(4990),
  refunded: usd(4990),
  credits: null,
  ...over,
})

// Every message the Owner can receive, in full: these strings are the copy (T72).
describe('renderAlert', () => {
  it('refund: amount, product and masked user; credits from T71 when known, otherwise 「见后台」', () => {
    expect(text(refund())).toBe(
      `【退款】j***@gmail.com 的 Pro 月付退款 $49.90，积分处理见后台。\n去后台看：https://shotviva.com/admin/users/${USER}`,
    )
    expect(text(refund({ credits: { clawedBack: 135, shortfall: 0 } }))).toContain('退款 $49.90，已自动扣回 135 积分。')
    expect(text(refund({ refunded: usd(2000), credits: { clawedBack: 20, shortfall: 34 } }))).toContain(
      'Pro 月付退款 $20.00（这笔共付 $49.90，部分退款），已扣回 20 积分，还差 34 积分没扣回（已被用掉）。',
    )
    expect(text(refund({ productId: 'pack_s', credits: { clawedBack: 0, shortfall: 0 } }))).toContain('S 积分包退款 $49.90，没有要扣回的积分。')
  })

  it('Waffo refund: the payment total when the refunded amount is unknown; orders page when the payment is unknown', () => {
    expect(text(refund({ channel: 'waffo', refunded: null }))).toContain('Pro 月付有一笔退款（这笔付了 $49.90），积分处理见后台。')
    expect(text(refund({ refunded: null, amount: null, productId: null, userId: null }), { who: null })).toBe(
      '【退款】一位用户 的 一笔付款有一笔退款，积分处理见后台。\n去后台看：https://shotviva.com/admin/orders',
    )
  })

  it('dispute opened and closed', () => {
    const base = { userId: USER, productId: 'starter_monthly', amount: usd(1990), disputeId: 'dp_1' }
    expect(text({ kind: 'dispute_opened', ...base, credits: null })).toBe(
      `【拒付】j***@gmail.com 向银行投诉了 Starter 月付 $19.90 这笔扣款，积分处理见后台。请尽快到 Stripe 后台提交证据。\n去后台看：https://shotviva.com/admin/users/${USER}`,
    )
    expect(text({ kind: 'dispute_closed', ...base, won: true, creditsReturned: 50 })).toContain(
      '【拒付结果】j***@gmail.com 的 Starter 月付 $19.90 的拒付我们赢了，钱回到我们这边，已还回 50 积分。',
    )
    expect(text({ kind: 'dispute_closed', ...base, won: false, creditsReturned: null })).toContain('拒付我们输了，钱退给了用户，扣回的积分不再还回。')
  })

  it('T82: a dispute with its evidence drafted links the 拒付 page with deadline, ban and what to do', () => {
    const base = { userId: USER, productId: 'pro_monthly', amount: usd(4990), disputeId: 'du_1', credits: null }
    const evidence = { dueBy: '2026-11-18T15:59:00Z', responder: 'shotviva' as const, autoBanned: true, draft: 'staged' as const }
    expect(text({ kind: 'dispute_opened', ...base, evidence })).toBe(
      '【拒付】j***@gmail.com 向银行投诉了 Pro 月付 $49.90 这笔扣款，积分处理见后台。账号已自动封禁。申诉证据已整理成草稿，请到后台检查后提交，截止北京时间 11月18日 23:59。\n去后台看：https://shotviva.com/admin/disputes/du_1',
    )
    expect(text({ kind: 'dispute_opened', ...base, evidence: { ...evidence, responder: 'stripe', autoBanned: false } })).toContain('这笔由 Stripe 应诉（Managed Payments），证据草稿已存给 Stripe 参考，不用你提交')
    expect(text({ kind: 'dispute_opened', ...base, evidence: { ...evidence, draft: 'failed' } })).toContain('证据草稿这次没能存到 Stripe（Stripe 重发通知时会自动重试）')
    expect(text({ kind: 'dispute_due_soon', userId: USER, productId: 'pack_s', amount: usd(990), disputeId: 'du_2', dueBy: '2026-11-18T15:59:00Z' })).toBe(
      '【拒付快到期】j***@gmail.com 的 S 积分包 $9.90 拒付还没提交申诉，截止北京时间 11月18日 23:59，只剩不到 3 天。\n去后台看：https://shotviva.com/admin/disputes/du_2',
    )
  })

  it('payment that did not land, and other payment notices that failed', () => {
    const failed = { kind: 'payment_failed', channel: 'stripe', eventId: 'evt_1', userId: USER } as const
    expect(text({ ...failed, step: 'purchase', productId: 'starter_monthly', amount: usd(1990) })).toBe(
      '【付款没到账】一笔 $19.90 的 Starter 月付没能自动到账（Stripe），请到后台订单页处理。\n去后台看：https://shotviva.com/admin/orders',
    )
    expect(text({ ...failed, step: 'renewal', productId: null, amount: usd(4990) })).toContain('一笔 $49.90 的续费没能自动到账（Stripe）')
    expect(text({ ...failed, channel: 'waffo', step: 'purchase', productId: null, amount: null })).toContain('一笔付款没能自动到账（Waffo）')
    expect(text({ ...failed, step: 'subscription', productId: null, amount: null })).toContain(
      '【付款通知出错】Stripe 发来的一条订阅状态更新没能处理，Stripe 会自动重发；如果一直失败，请到后台订单页看看。',
    )
  })

})

describe('renderAlert: operations', () => {
  it('generation failure spike', () => {
    expect(text({ kind: 'generation_spike', failed: 7, total: 20, windowMinutes: 60 })).toBe(
      '【出图失败偏多】过去 60 分钟有 7 张图没生成出来（共 20 张，失败 35%），失败的积分会自动退回，可能是出图服务出了问题。\n去后台看：https://shotviva.com/admin/jobs?status=failed',
    )
  })

  it('tickets: new and follow-up, refund requests tagged', () => {
    const ticket = { kind: 'ticket', ticketId: TICKET, userId: USER, pending: null } as const
    expect(text({ ...ticket, reply: false, ticketType: 'refund' })).toBe(
      `【新工单·退款申请】j***@gmail.com 提交了一张「申请退款」工单，等你回复。\n去后台看：https://shotviva.com/admin/tickets/${TICKET}`,
    )
    expect(text({ ...ticket, reply: true, ticketType: 'image_issue' })).toContain('【工单回复】j***@gmail.com 在「出图问题」工单里补充了新消息。')
    expect(text({ ...ticket, reply: true, ticketType: 'refund', pending: 4 })).toContain('【工单回复·退款申请】j***@gmail.com 在「申请退款」工单里有 4 条新消息还没回复。')
    expect(text({ ...ticket, reply: false, ticketType: null })).toContain('提交了一张「其他」工单')
  })

  it('old subscription not cancelled after an upgrade', () => {
    expect(text({ kind: 'subscription_cancel_failed', userId: USER, channel: 'stripe', productId: 'starter_monthly', subscriptionRef: 'sub_1' })).toBe(
      `【旧订阅没取消】j***@gmail.com 升级后，原来的 Starter 月付 订阅没能自动取消，下个周期还会扣费，请到 Stripe 后台手动取消。\n去后台看：https://shotviva.com/admin/users/${USER}`,
    )
    expect(text({ kind: 'subscription_cancel_failed', userId: USER, channel: null, productId: null, subscriptionRef: null })).toContain(
      '升级付款成功了，但系统没读到原来的订阅，请到后台确认有没有要手动取消的。',
    )
  })

  it('a refunded membership whose subscription would not cancel (T71)', () => {
    expect(text({ kind: 'subscription_cancel_failed', userId: USER, channel: 'waffo', productId: 'pro_monthly', subscriptionRef: 'ORD_1', cause: 'refund' })).toBe(
      `【订阅没取消】j***@gmail.com 的 Pro 月付 已退款，但这笔的订阅没能自动取消，下个周期还会扣费，请到 Waffo 后台手动取消。\n去后台看：https://shotviva.com/admin/users/${USER}`,
    )
  })

  it('marks the test site, and puts no ids, codes or event names in the sentence', () => {
    const { sentence } = renderAlert(refund(), { ...ctx, origin: 'https://validation.example', testSite: true })
    expect(sentence.startsWith('（测试站）【退款】')).toBe(true)
    expect(sentence).not.toMatch(/ch_1|pro_monthly|evt_|charge\.|[0-9a-f]{8}-/)
  })
})
