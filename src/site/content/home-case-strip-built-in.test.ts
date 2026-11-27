import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HeroStrip } from '@/core/content/blocks/hero-strip'
import type { Locale } from '@/core/i18n'

import { heroOptionContent, HERO_OPTIONS } from '../experiments/hero-options'
import { homeCaseStrip } from './home-case-strip'

const covered = (id: string) => ({ id, name: id, description: null, coverBeforeUrl: `https://a.test/${id}-b.webp`, coverAfterUrl: `https://a.test/${id}-a.webp` })
const messages = { marketing: { home: { stripPick: 'Use {name}', bundleAria: '{name}, showing {template}', bundleBadge: 'Set', bundleCount: '{count} picked', phone: 'Real phone photo', ai: 'AI' } } }
const Provider = NextIntlClientProvider as ComponentType<{ locale: string; messages: typeof messages; children?: ReactNode }>

// Every built-in 「更多真实案例」 pair (Codex, #930 step 5): it names the template its pictures were
// cut from, opens that template while it is live, and is a plain picture (no button) when not.
const builtInRows = HERO_OPTIONS.flatMap(({ id }) => (['en', 'zh'] as Locale[]).flatMap((locale) => {
  const strip = heroOptionContent(id, locale)?.strip
  return strip ? [{ option: id, locale, strip }] : []
}))

describe('the built-in 「更多真实案例」 rows', () => {
  it('exist for the home page in both languages', () => {
    expect(builtInRows.map(({ option, locale }) => `${option}/${locale}`)).toEqual(expect.arrayContaining(['food/en', 'food/zh']))
  })

  it.each(builtInRows.map((row) => [`${row.option}/${row.locale}`, row] as const))('%s: every pair names its source template', (_name, { strip }) => {
    for (const item of strip.items) expect(item.template).toMatch(/^[a-z0-9-]+$/)
  })

  it.each(builtInRows.map((row) => [`${row.option}/${row.locale}`, row] as const))('%s: a live source template opens it, any other is a plain picture', (_name, { strip, locale }) => {
    const [kept, ...gone] = strip.items.map((item) => item.template!)
    // Only the first pair's template is live in this catalogue.
    const shown = homeCaseStrip(strip, [], [covered(kept!)], locale)!
    expect(shown.items[0]).toMatchObject({ pick: kept })
    for (const item of shown.items.slice(1)) {
      expect(item.pick).toBeUndefined()
      expect(item).not.toHaveProperty('template')
    }
    const html = renderToStaticMarkup(createElement(Provider, { locale, messages }, createElement(HeroStrip, { strip: shown })))
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain(`data-pick-template="${kept}"`)
    expect(html.match(/<figure>/g)).toHaveLength(gone.length)
  })

  it('opens every pair whose template is live', () => {
    for (const { strip, locale } of builtInRows) {
      const all = strip.items.map((item) => covered(item.template!))
      expect(homeCaseStrip(strip, [], all, locale)!.items.map((item) => item.pick)).toEqual(strip.items.map((item) => item.template))
    }
  })
})
