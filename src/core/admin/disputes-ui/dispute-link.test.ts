import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { renderAlert } from '@/core/alerts/templates'
import { lowercasePath } from '@/core/auth/proxy-gates'
import { disputeAdminPath } from '@/core/billing/stripe'

import { DisputesList } from './disputes-list'
import type { DisputeCard } from './view-model'

// Codex on #307 (ff3d884): the list linked /admin/disputes/du_1UZFae…, the proxy lowercased the
// path (建站规格 R4) and the case-sensitive Stripe id no longer matched: 404. Every link to a
// dispute must survive the proxy unchanged, keep the id exactly, and land on a real route.

const ID = 'du_1UZFaeCmDxPwIQ4daCa0KXT6'
const ROUTE = join(process.cwd(), 'src/app/[locale]/(app)/admin/disputes/view/page.tsx')

const card: DisputeCard = {
  id: ID,
  amount: 'US$9.90',
  reason: '盗刷 / 非本人交易',
  user: 'qa@example.test',
  userId: null,
  status: '待提交证据',
  tone: 'urgent',
  due: '2026-11-18 23:59（北京时间）',
  daysLeft: '还剩 10 天',
  received: '2026-11-08 12:00',
  responder: '我们提交',
  banned: true,
  drafted: true,
}

function resolves(href: string) {
  const url = new URL(href, 'https://shotviva.com')
  expect(lowercasePath(url.pathname)).toBeNull()
  expect(url.pathname).toBe('/admin/disputes/view')
  expect(url.searchParams.get('id')).toBe(ID)
  expect(existsSync(ROUTE)).toBe(true)
}

describe('links to one dispute', () => {
  it('the list card links an address the proxy leaves alone, with the id intact', () => {
    const html = renderToStaticMarkup(createElement(DisputesList, { cards: [card], nextHref: null }))
    const href = /href="([^"]*view[^"]*)"/.exec(html)?.[1]?.replaceAll('&amp;', '&')
    expect(href).toBeDefined()
    resolves(href ?? '')
  })

  it('disputeAdminPath and the Feishu alert link do the same', () => {
    resolves(disputeAdminPath(ID))
    const { link } = renderAlert(
      { kind: 'dispute_due_soon', disputeId: ID, userId: null, productId: 'pack_s', amount: { cents: 990, currency: 'usd' }, dueBy: '2026-11-18T15:59:00Z' },
      { who: null, origin: 'https://shotviva.com', testSite: false },
    )
    resolves(link.replace('去后台看：', ''))
  })
})
