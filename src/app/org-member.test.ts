import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

import type { StaffCard } from '@/core/org/console/types'

vi.mock('@/core/i18n/ui', () => ({ Link: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never) }))
vi.mock('@/core/analytics/replay', () => ({ REPLAY_BLOCK_CLASS: 'sv-replay-block' }))

const { MemberEntry, MemberLinkCallout, MEMBER_ORG_HREF } = await import('@/core/org/ui/member-entry')
const { MemberOrgView } = await import('@/core/org/ui/staff-card')

// Fake data only: no real company, account or price.
const staff = (over: Partial<StaffCard> = {}): StaffCard => ({
  kind: 'member', orgName: 'Acme Studio', status: 'active', monthlyAllowance: 500, allocatedThisMonth: 600, heldCredits: 80, customers: 3,
  promo: { allowance: 2000, allocated: 2000, used: 250, held: 1750 },
  withLevel2: false, period: '2026-11', performance: { l1: { customers: 3, signups: 1, paying: 2, paidCents: 12345 }, l2: { customers: 4, signups: 0, paying: 1, paidCents: 6789 } },
  ...over,
})

type Messages = typeof en
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: Messages; timeZone: string; onError: (error: Error) => void }>
function render(locale: 'en' | 'zh', element: ReactElement) {
  const errors: string[] = []
  const html = renderToStaticMarkup(createElement(Intl, { locale, messages: locale === 'en' ? en : (zh as unknown as Messages), timeZone: 'UTC', onError: (e) => errors.push(e.message) }, element))
  return { html, errors, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

describe.each(['en', 'zh'] as const)('a member of an org (%s)', (locale) => {
  it("on /account shows only the org row, into the member's own org page, and what is left of the month", () => {
    const { html, text, errors } = render(locale, createElement(MemberEntry, { data: staff() }))
    expect(errors).toEqual([])
    expect(html).toContain(`href="${MEMBER_ORG_HREF}"`)
    expect(text).toContain('Acme Studio')
    // Paid: 80 left of 500 a month; promotion: 1,750 left of 2,000 a month.
    expect(text).toMatch(/\b80\b/)
    expect(text).toContain('500')
    expect(text).toContain('1,750')
    expect(text).toContain('2,000')
    // The detail moved to the org page: no customers, spend or level-2 here, and no way to leave.
    expect(text).not.toContain('$123.45')
    expect(text).not.toMatch(/Paying this month|本月付费人数|Spend this month|本月消费|level 2|二级/)
    expect(text).not.toMatch(/Leave|退出/)
    expect(html).not.toMatch(/<button/)
  })

  it('says when the promotion credits could not be read instead of a zero', () => {
    const { text } = render(locale, createElement(MemberEntry, { data: staff({ promo: null }) }))
    expect(text).toContain('—')
  })

  it('shows the paused org on the row', () => {
    const { text } = render(locale, createElement(MemberEntry, { data: staff({ status: 'suspended' }) }))
    expect(text).toMatch(/paused|暂停/)
  })

  it('puts the promotion link on the highlighted callout with a copy button', () => {
    const { html, text, errors } = render(locale, createElement(MemberLinkCallout, { path: '/zh?code=ABCD1234' }))
    expect(errors).toEqual([])
    expect(html).toContain('bg-[var(--caution-tint)]')
    expect(text).toContain('/zh?code=ABCD1234')
    expect(text).toMatch(/My promo link|我的推广链接/)
    expect(text).toMatch(/Copy link|复制链接/)
  })

  it("on the org page shows the member's own month in detail and their customers, never a commission", () => {
    const { text, errors } = render(locale, createElement(MemberOrgView, { data: staff() }))
    expect(errors).toEqual([])
    expect(text).toMatch(/600/)
    expect(text).toContain('1,750')
    expect(text).toContain('250')
    expect(text).toMatch(locale === 'en' ? /watermarked/ : /带水印/)
    expect(text).toContain('$123.45')
    expect(text).not.toContain('$67.89')
    expect(text).not.toMatch(/commission|佣金|Leave|退出/i)
  })

  it('adds the level-2 customers when the org has them', () => {
    const { text } = render(locale, createElement(MemberOrgView, { data: staff({ withLevel2: true }) }))
    expect(text).toContain('$67.89')
  })
})
