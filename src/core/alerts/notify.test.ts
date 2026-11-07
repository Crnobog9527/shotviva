import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMemoryStore } from '../../../tests/fakes/memory-store'
import type { OwnerAlert } from './alert-kinds'
import { createDedupe } from './dedupe'
import { noteGenerationFailureWith, notifyOwnerWith, type NotifyDeps } from './notify'

const captureError = vi.hoisted(() => vi.fn())
vi.mock('../analytics/capture-error', () => ({ captureError }))

const USER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const config = { webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook', secret: 'demo-secret' }

type Row = Record<string, unknown> | null

// Just the reads the notifier makes: auth.admin.getUserById and single-row selects.
function fakeDb(rows: { payments?: Row; support_tickets?: Row; generation_jobs?: unknown[] } = {}) {
  const query = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      neq: () => chain,
      order: () => chain,
      limit: async () => ({ data: rows.generation_jobs ?? [], error: null }),
      maybeSingle: async () => ({ data: (rows as Record<string, Row>)[table] ?? null, error: null }),
    }
    return chain
  }
  return {
    from: vi.fn(query),
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { email: 'jane.doe@gmail.com', phone: '' } }, error: null })) } },
  }
}

const ok = () => new Response(JSON.stringify({ code: 0, msg: 'success', data: {} }))

function setup(db = fakeDb(), fetch = vi.fn(async () => ok())) {
  const { store, objects } = createMemoryStore()
  const deps: NotifyDeps = {
    config,
    db: () => db as never,
    dedupe: createDedupe(() => store),
    feishu: { fetch: fetch as never, now: () => 1_700_000_000_000 },
    origin: 'https://shotviva.com',
    testSite: false,
  }
  const sent = () => fetch.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).content.text as string)
  return { deps, fetch, sent, objects, db }
}

const ticket: OwnerAlert = { kind: 'ticket', ticketId: 't-1', messageId: null, userId: USER, ticketType: 'refund' }

beforeEach(() => captureError.mockClear())

describe('notifyOwnerWith', () => {
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

  it('reads a follow-up ticket type and a Waffo refund payment before rendering', async () => {
    const db = fakeDb({
      support_tickets: { type: 'billing' },
      payments: { user_id: USER, product_id: 'max_yearly', amount_total: 71300, currency: 'usd' },
    })
    const { deps, sent } = setup(db)
    await notifyOwnerWith(deps, { ...ticket, messageId: 'm-1', ticketType: null })
    await notifyOwnerWith(deps, {
      kind: 'refund',
      channel: 'waffo',
      refundId: 'REF_1',
      waffoPaymentId: 'PAY_1',
      userId: null,
      productId: null,
      amount: null,
      refunded: null,
      credits: null,
    })
    expect(sent()[0]).toContain('在「付款与账单」工单里补充了新消息')
    expect(sent()[1]).toBe(`【退款】j***@gmail.com 的 Max 年付有一笔退款（这笔付了 $713.00），积分处理见后台。\n去后台看：https://shotviva.com/admin/users/${USER}`)
  })

  it('never throws when Feishu fails: logs, reports to Sentry, and frees the key for a retry', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code: 19021, msg: 'sign match fail' })))
    const { deps, objects } = setup(fakeDb(), fetch)
    await expect(notifyOwnerWith(deps, ticket)).resolves.toBeUndefined()
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), { level: 'warning', fields: { owner_alert: 'ticket' } })
    expect(objects.size).toBe(0)
    fetch.mockImplementation(async () => ok())
    await notifyOwnerWith(deps, ticket)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('still sends, without the name, when the user lookup fails', async () => {
    const db = fakeDb()
    db.auth.admin.getUserById.mockRejectedValue(new Error('auth down'))
    const { deps, sent } = setup(db)
    await notifyOwnerWith(deps, ticket)
    expect(sent()[0]).toContain('一位用户 提交了一张')
  })
})

describe('noteGenerationFailureWith', () => {
  const failed = { status: 'failed', error_code: 'PROVIDER_TIMEOUT' }
  const done = { status: 'succeeded', error_code: null }
  const now = new Date('2026-11-08T10:15:00Z')

  it('alerts once in the hour when the last 60 minutes cross the rule', async () => {
    const { deps, sent, db } = setup(fakeDb({ generation_jobs: [...Array(6).fill(failed), ...Array(4).fill(done)] }))
    await noteGenerationFailureWith(deps, now)
    await noteGenerationFailureWith(deps, new Date('2026-11-08T10:40:00Z'))
    expect(sent()).toHaveLength(1)
    expect(sent()[0]).toContain('过去 60 分钟有 6 张图没生成出来（共 10 张，失败 60%）')
    // The second failure in the same hour skipped the read.
    expect(db.from).toHaveBeenCalledTimes(1)
  })

  it('stays quiet below the rule and when alerts are off', async () => {
    const { deps, fetch, db } = setup(fakeDb({ generation_jobs: [...Array(4).fill(failed), ...Array(1).fill(done)] }))
    await noteGenerationFailureWith(deps, now)
    await noteGenerationFailureWith({ ...deps, config: null }, now)
    expect(fetch).not.toHaveBeenCalled()
    expect(db.from).toHaveBeenCalledTimes(1)
  })
})
