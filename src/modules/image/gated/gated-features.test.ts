import { readFileSync } from 'node:fs'

import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { GatedFeatures } from './gated-features'

vi.mock('@/core/i18n/ui', () => ({
  Link: ({ href, className, children }: { href: string; className?: string; children: unknown }) => createElement('a', { href, className }, children as never),
}))

// The real English messages, read by path (a module may not import site/).
const en = JSON.parse(readFileSync('src/site/messages/en.json', 'utf8')) as Record<string, unknown>
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: typeof en; timeZone: string }>
const render = (element: ReactElement) => renderToStaticMarkup(createElement(Intl, { locale: 'en', messages: en, timeZone: 'UTC' }, element))

const LOCK = /needs (Pro|Max)/g
const DEMO = 'See how it works'

describe('GatedFeatures (Create page, one Batch create card, Owner 2026-11-12)', () => {
  it('is one card naming both plans, locked below Pro, with no link to another page', () => {
    const html = render(createElement(GatedFeatures, { tier: null }))
    expect(html).toContain('Batch create')
    expect(html).toContain('10 photos')
    expect(html).toContain('30 photos · 5 templates')
    expect(html.match(LOCK)).toEqual(['needs Pro', 'needs Max'])
    expect(html).not.toContain('<a ')
  })

  it('shows "See how it works" as words on a button on every plan', () => {
    for (const tier of [null, 'starter', 'pro', 'max'] as const) {
      const html = render(createElement(GatedFeatures, { tier }))
      expect(html).toMatch(new RegExp(`<button[^>]*>(?:(?!</button>).)*${DEMO}`, 's'))
    }
  })

  it('opens Batch create in place for Pro (Max still marked locked) and Max, never by a link', () => {
    const pro = render(createElement(GatedFeatures, { tier: 'pro' }))
    expect(pro.match(LOCK)).toEqual(['needs Max'])
    const max = render(createElement(GatedFeatures, { tier: 'max' }))
    expect(max.match(LOCK)).toBeNull()
    for (const html of [pro, max]) expect(html).not.toContain('/generate/batch')
  })
})
