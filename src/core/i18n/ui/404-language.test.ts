import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ locale: 'zh', path: '/page-not-found' }))
vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: () => (key: string) => ({ en: 'English', zh: '简体中文', label: 'Language' })[key] ?? key,
}))
vi.mock('../navigation', () => ({ usePathname: () => state.path }))
vi.mock('./language-hint', () => ({ useLanguageHint: () => ({ on: false, dismiss: () => {} }), LanguageHintBubble: () => null }))

import { FooterLocales } from './footer-locales'
import { LocaleMenu } from './locale-menu'

const translatedPaths = ['/', '/commercial-photography']
const links = (html: string) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(?:<[^>]+>)*\s*(English|简体中文)/g)]
  .map((match) => [match[2], match[1]])

beforeEach(() => { state.locale = 'zh'; state.path = '/page-not-found' })

describe('404 language links', () => {
  it('points both menu and footer to the English home', () => {
    expect(links(renderToStaticMarkup(createElement(LocaleMenu, { translatedPaths, homeOnly: true })))).toContainEqual(['English', '/'])
    expect(links(renderToStaticMarkup(createElement(FooterLocales, { translatedPaths, homeOnly: true })))).toContainEqual(['English', '/'])
  })

  it('points both menu and footer to the Chinese home', () => {
    state.locale = 'en'
    state.path = '/xxx-not-exist'
    expect(links(renderToStaticMarkup(createElement(LocaleMenu, { translatedPaths, homeOnly: true })))).toContainEqual(['简体中文', '/zh'])
    expect(links(renderToStaticMarkup(createElement(FooterLocales, { translatedPaths, homeOnly: true })))).toContainEqual(['简体中文', '/zh'])
  })

  it('keeps normal translated page links', () => {
    state.path = '/commercial-photography'
    expect(links(renderToStaticMarkup(createElement(FooterLocales, { translatedPaths })))).toContainEqual(['English', '/commercial-photography'])
    state.locale = 'en'
    expect(links(renderToStaticMarkup(createElement(LocaleMenu, { translatedPaths })))).toContainEqual(['简体中文', '/zh/commercial-photography'])
  })
})
