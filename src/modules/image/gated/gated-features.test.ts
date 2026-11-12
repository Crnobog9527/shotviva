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
const TUTORIAL = 'aria-label="Batch create tutorial"'

describe('GatedFeatures (Create page, one Batch create card, Owner 2026-11-12)', () => {
  it('is one card naming both plans, locked below Pro, opening the intro (never a link)', () => {
    const html = render(createElement(GatedFeatures, { tier: null }))
    expect(html).toContain('Batch create')
    expect(html).toContain('10 photos')
    expect(html).toContain('30 photos · 5 templates')
    expect(html.match(LOCK)).toEqual(['needs Pro', 'needs Max'])
    expect(html).not.toContain('<a ')
    expect(html).toContain(TUTORIAL)
  })

  it('sends Pro straight into Batch create, with Max still marked locked', () => {
    const html = render(createElement(GatedFeatures, { tier: 'pro' }))
    expect(html.match(LOCK)).toEqual(['needs Max'])
    expect(html.match(/<a href="\/generate\/batch"/g)).toHaveLength(1)
    expect(html).toContain(TUTORIAL)
  })

  it('sends Max straight into Batch create with nothing locked', () => {
    const html = render(createElement(GatedFeatures, { tier: 'max' }))
    expect(html.match(LOCK)).toBeNull()
    expect(html.match(/<a href="\/generate\/batch"/g)).toHaveLength(1)
  })
})
