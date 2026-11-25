import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import messages from '@/site/messages/en.json'

import { tierOffers } from '@/core/billing/paywall'
import { OPEN_ON_DESKTOP, PlanCompare } from '@/core/billing/paywall/plan-compare'
import { TEST_PRODUCTS } from '@/core/billing/stripe/test-products'

// Owner 2026-11-25: "Compare every plan" starts open on desktop (≥768px) and closed on phones,
// and toggles on both. The server HTML is the same for both (closed), so hydration never
// mismatches; the inline script right after the <details> decides while the page is parsed.
describe('PlanCompare default state', () => {
  const html = () => {
    const provider: ComponentProps<typeof NextIntlClientProvider> = {
      locale: 'en', messages, timeZone: 'UTC',
      children: createElement(PlanCompare, { offers: tierOffers(TEST_PRODUCTS), period: 'month' }),
    }
    return renderToString(createElement(NextIntlClientProvider, provider))
  }

  it('renders a closed native <details> with every row, followed by the opening script', () => {
    const out = html()
    const details = out.match(/<details[^>]*>/)?.[0] ?? ''
    expect(details).not.toMatch(/\sopen/)
    expect(out).toContain('Compare every plan')
    expect(out).toContain('Credits a month')
    expect(out).toMatch(/<\/details><script>\(function\(s\)/)
  })

  // The script runs in the browser; here its two globals are stand-ins.
  const run = (desktop: boolean) => {
    const details = { open: false, attrs: new Set<string>(), setAttribute(name: string) { this.attrs.add(name) } }
    const matchMedia = (query: string) => ({ matches: desktop && query === '(min-width: 768px)' })
    new Function('document', 'matchMedia', OPEN_ON_DESKTOP)({ currentScript: { previousElementSibling: details } }, matchMedia)
    return details
  }

  it('opens the table at desktop width and leaves it closed on a phone, marking both decided', () => {
    const desktop = run(true)
    expect(desktop.open).toBe(true)
    expect(desktop.attrs.has('data-decided')).toBe(true)
    const phone = run(false)
    expect(phone.open).toBe(false)
    expect(phone.attrs.has('data-decided')).toBe(true)
  })
})
