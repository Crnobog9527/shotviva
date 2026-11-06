import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Locale } from '../locales'
import { Link } from './localized-link'
import { TranslatedPathsProvider } from './translated-paths'

function href(target: string, locale: Locale) {
  const link = createElement(Link, { href: target }, 'x')
  const paths: ComponentProps<typeof TranslatedPathsProvider> = { paths: ['/', '/pricing'], children: link }
  const provider: ComponentProps<typeof NextIntlClientProvider> = { locale, messages: {}, children: createElement(TranslatedPathsProvider, paths) }
  return /href="([^"]*)"/.exec(renderToStaticMarkup(createElement(NextIntlClientProvider, provider)))?.[1]
}

describe('localized Link', () => {
  it('keeps the home page anchor without a trailing slash on /zh (建站规格 R4)', () => {
    expect(href('/#templates', 'zh')).toBe('/zh#templates')
    expect(href('/#templates', 'en')).toBe('/#templates')
  })

  it('prefixes translated pages and leaves English-only ones as they are', () => {
    expect(href('/pricing', 'zh')).toBe('/zh/pricing')
    expect(href('/terms', 'zh')).toBe('/terms')
  })
})
