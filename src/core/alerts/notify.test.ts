import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMemoryMarkers } from '../../../tests/fakes/memory-markers'
import type { OwnerAlert } from './alert-kinds'
import { createBackoff } from './backoff'
import { createDedupe } from './dedupe'
import { noteGenerationFailureWith, noteServerErrorWith, notifyOwnerWith, type NotifyDeps } from './notify'
import { createErrorWindow } from './site-errors'

const captureError = vi.hoisted(() => vi.fn())
vi.mock('../analytics/capture-error', () => ({ captureError }))

const USER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const config = { webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook', secret: 'demo-secret' }
const MINUTE = 60_000

type Rows = { payments?: unknown; support_tickets?: unknown; messages?: unknown[]; counts?: number[] }

// Just the reads the notifier makes: auth.admin.getUserById, single-row selects, the newest
// ticket messages and the two failure counts.
function fakeDb(rows: Rows = {}) {
  const counts = [...(rows.counts ?? [])]
  const query = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      neq: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      abortSignal: (): unknown => {
        if (table === 'support_ticket_messages') return Promise.resolve({ data: rows.messages ?? [], error: null })
        if (table === 'generation_jobs') return Promise.resolve({ count: counts.shift() ?? 0, error: null })
        return chain
      },
      maybeSingle: async () => ({ data: (rows as Record<string, unknown>)[table] ?? null, error: null }),
    }
    return chain
  }
  return {
    from: vi.fn(query),
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { email: 'jane.doe@gmail.com', phone: '' } }, error: null })) } },
  }
}

const ok = () => new Response(JSON.stringify({ code: 0, msg: 'success', data: {} }))
const answer = (body: unknown) => async () => new Response(JSON.stringify(body))

function setup(db = fakeDb(), fetch = vi.fn(async () => ok())) {
  const time = { now: Date.parse('2026-11-08T06:05:00Z') }
  const now = () => time.now
  const { store, marks } = createMemoryMarkers(now)
  const deps: NotifyDeps = {
    config,
    db: () => db as never,
    dedupe: createDedupe(() => store, now),
    backoff: createBackoff(),
    feishu: { fetch: fetch as never, now },
    origin: 'https://shotviva.com',
    testSite: false,
    sentryUrl: 'https://acme.sentry.io/issues/?environment=production&statsPeriod=1h',
    now,
    sleep: vi.fn(async () => undefined),
    lastSpikeCheck: { at: 0 },
  }
  const sent = () => fetch.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).content.text as string)
  return { deps, fetch, sent, marks, db, time }
}

const ticket: OwnerAlert = { kind: 'ticket', ticketId: 't-1', reply: false, userId: USER, ticketType: 'refund', pending: null }
const reply: OwnerAlert = { ...ticket, reply: true, ticketType: null }
const refund: OwnerAlert = {
  kind: 'refund',
  channel: 'stripe',
  refundId: 'ch_1',
  userId: USER,
  productId: 'pro_monthly',
  amount: { cents: 4990, currency: 'usd' },
  refunded: { cents: 4990, currency: 'usd' },
  credits: null,
}

beforeEach(() => captureError.mockClear())

describe('notifyOwnerWith: sending', () => {
  it('does nothing at all without the Feishu settings', async () => {
    const { deps, fetch, db } = setup()
    await notifyOwnerWith({ ...deps, config: null }, ticket)
    expect(fetch).not.toHaveBeenCalled()
    expect(db.auth.admin.getUserById).not.toHaveBeenCalled()
  })

  it('sends the Chinese message with the masked user, once per fact', async () => {
    const { deps, sent } = setup()
    await notifyOwnerWith(deps, ticket)
    await notifyOwnerWith(deps, ticket)
    expect(sent()).toEqual(['【新工单·退款申请】j***@gmail.com 提交了一张「申请退款」工单，等你回复。\n去后台看：https://shotviva.com/admin/tickets/t-1'])
  })

  it('reads a Waffo refund payment before rendering', async () => {
    const db = fakeDb({ payments: { user_id: USER, product_id: 'max_yearly', amount_total: 71300, currency: 'usd' } })
    const { deps, sent } = setup(db)
    await notifyOwnerWith(deps, { kind: 'refund', channel: 'waffo', refundId: 'REF_1', waffoPaymentId: 'PAY_1', userId: null, productId: null, amount: null, refunded: null, credits: null })
    expect(sent()[0]).toBe(`【退款】j***@gmail.com 的 Max 年付有一笔退款（这笔付了 $713.00），积分处理见后台。\n去后台看：https://shotviva.com/admin/users/${USER}`)
  })

  it('still sends, without the name, when the user lookup fails', async () => {
    const db = fakeDb()
    db.auth.admin.getUserById.mockRejectedValue(new Error('auth down'))
    const { deps, sent } = setup(db)
    await notifyOwnerWith(deps, ticket)
    expect(sent()[0]).toContain('一位用户 提交了一张')
  })
})

describe('notifyOwnerWith: flood control', () => {
  it('collapses replies: one per ticket per 30 minutes, counting the unanswered messages', async () => {
    const messages = [{ author: 'user' }, { author: 'user' }, { author: 'user' }, { author: 'admin' }, { author: 'user' }]
    const { deps, sent, time } = setup(fakeDb({ support_tickets: { type: 'billing' }, messages }))
    await notifyOwnerWith(deps, reply)
    time.now += 10 * MINUTE
    await notifyOwnerWith(deps, reply)
    expect(sent()).toEqual(['【工单回复】j***@gmail.com 在「付款与账单」工单里有 3 条新消息还没回复。\n去后台看：https://shotviva.com/admin/tickets/t-1'])
    time.now += 21 * MINUTE
    await notifyOwnerWith(deps, reply)
    expect(sent()).toHaveLength(2)
  })

  it('caps ticket alerts per hour, never money alerts', async () => {
    const { deps, sent } = setup()
    for (let i = 0; i < 12; i += 1) await notifyOwnerWith(deps, { ...ticket, ticketId: `t-${i}` })
    await notifyOwnerWith(deps, refund)
    expect(sent().filter((text) => text.includes('新工单'))).toHaveLength(10)
    expect(sent().at(-1)).toContain('【退款】')
  })

  it('retries a rate-limited money alert, not a ticket', async () => {
    const fetch = vi.fn(answer({ code: 11232, msg: 'frequency limited' }))
    fetch.mockImplementationOnce(answer({ code: 11232 })).mockImplementationOnce(async () => ok())
    const { deps, sent } = setup(fakeDb(), fetch as never)
    await notifyOwnerWith(deps, refund)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(deps.sleep).toHaveBeenCalledWith(2000)
    expect(sent()).toHaveLength(2)
    fetch.mockClear()
    fetch.mockImplementation(answer({ code: 11232 }))
    await notifyOwnerWith({ ...deps, backoff: createBackoff() }, { ...ticket, ticketId: 't-9' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('notifyOwnerWith: failures', () => {
  it('a definite refusal frees the key for a retry; a timeout keeps it (it may have arrived)', async () => {
    const fetch = vi.fn(answer({ code: 19021, msg: 'sign match fail' }))
    const { deps, marks } = setup(fakeDb(), fetch as never)
    await expect(notifyOwnerWith(deps, refund)).resolves.toBeUndefined()
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), { level: 'warning', fields: { owner_alert: 'refund' } })
    expect(marks.size).toBe(0)
    fetch.mockImplementation(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    })
    await notifyOwnerWith(deps, refund)
    expect(marks.has('ops/alerts/refund:stripe:ch_1:4990')).toBe(true)
    fetch.mockImplementation(async () => ok())
    await notifyOwnerWith(deps, refund)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('backs off after a failure (non-money alerts not even claimed), money alerts still try', async () => {
    const fetch = vi.fn(answer({ code: 19021 }))
    const { deps, marks, time } = setup(fakeDb(), fetch as never)
    await notifyOwnerWith(deps, ticket)
    await notifyOwnerWith(deps, { ...ticket, ticketId: 't-2' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect([...marks.keys()].some((key) => key.includes('t-2'))).toBe(false)
    await notifyOwnerWith(deps, refund)
    expect(fetch).toHaveBeenCalledTimes(2)
    time.now += 5 * MINUTE
    fetch.mockImplementation(async () => ok())
    await notifyOwnerWith(deps, { ...ticket, ticketId: 't-2' })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})

describe('noteGenerationFailureWith', () => {
  it('alerts from the two counts, then not again within the hour (no further reads)', async () => {
    const { deps, sent, db, time } = setup(fakeDb({ counts: [10, 6, 10, 6] }))
    await noteGenerationFailureWith(deps)
    time.now += 25 * MINUTE
    await noteGenerationFailureWith(deps)
    expect(sent()).toHaveLength(1)
    expect(sent()[0]).toContain('过去 60 分钟有 6 张图没生成出来（共 10 张，失败 60%）')
    expect(db.from).toHaveBeenCalledTimes(2)
  })

  it('counts at most once a minute per instance and stays quiet below the rule', async () => {
    const { deps, fetch, db, time } = setup(fakeDb({ counts: [5, 4, 5, 4] }))
    await noteGenerationFailureWith(deps)
    time.now += 30_000
    await noteGenerationFailureWith(deps)
    expect(db.from).toHaveBeenCalledTimes(2)
    time.now += 31_000
    await noteGenerationFailureWith(deps)
    expect(db.from).toHaveBeenCalledTimes(4)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('noteServerErrorWith', () => {
  const payment = { source: 'api', route: 'checkout' } as const

  it('sends one 「网站报错异常」, then none for 30 minutes from it while errors keep coming', async () => {
    const { deps, sent, time } = setup()
    const window = createErrorWindow()
    for (let i = 0; i < 6; i += 1) {
      await noteServerErrorWith(deps, window, payment)
      time.now += MINUTE
    }
    expect(sent()).toHaveLength(1)
    expect(sent()[0]).toContain('【付款出错】过去 10 分钟服务器出错 3 次')
    expect(sent()[0]).toContain('去 Sentry 看：https://acme.sentry.io/issues/')
    // Still failing every minute: the next message comes 30 minutes after the first (sent at
    // minute 2), not at a clock boundary.
    for (let i = 6; i < 32; i += 1) {
      await noteServerErrorWith(deps, window, payment)
      time.now += MINUTE
    }
    expect(sent()).toHaveLength(1)
    await noteServerErrorWith(deps, window, payment)
    expect(sent()).toHaveLength(2)
  })

  it('ignores warnings and does nothing when alerts are off', async () => {
    const { deps, fetch } = setup()
    const window = createErrorWindow()
    for (let i = 0; i < 12; i += 1) await noteServerErrorWith(deps, window, { source: 'capture', alert: null, level: 'warning' })
    for (let i = 0; i < 12; i += 1) await noteServerErrorWith({ ...deps, config: null }, window, payment)
    expect(fetch).not.toHaveBeenCalled()
  })
})
