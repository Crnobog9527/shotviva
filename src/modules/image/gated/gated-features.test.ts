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

describe('GatedFeatures (Create page, Owner 2026-11-12)', () => {
  it('shows both features locked below Pro, as buttons that open an intro (never a link to the paywall)', () => {
    const html = render(createElement(GatedFeatures, { tier: null }))
    expect(html).toContain('Batch photos')
    expect(html).toContain('Up to 10 / 30 photos at once')
    expect(html).toContain('Several templates at once')
    expect(html.match(LOCK)).toEqual(['needs Pro', 'needs Max'])
    expect(html).not.toContain('<a ')
  })

  it('unlocks batch on Pro (its guide still opens in place) and keeps several templates locked on Max', () => {
    const html = render(createElement(GatedFeatures, { tier: 'pro' }))
    expect(html.match(LOCK)).toEqual(['needs Max'])
    expect(html).not.toContain('<a ')
  })

  it('sends Max straight into the batch workspace from both cards', () => {
    const html = render(createElement(GatedFeatures, { tier: 'max' }))
    expect(html.match(LOCK)).toBeNull()
    expect(html.match(/<a href="\/generate\/batch"/g)).toHaveLength(2)
  })
})
