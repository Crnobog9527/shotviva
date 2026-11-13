import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// Public pages turn Link prefetching off (link-prefetch.tsx), and an English-only target from a
// Chinese page is never prefetched (localized-link.tsx). next/link and the next-intl Link are
// stood in for so the prefetch they receive is visible.
const seen: Array<{ href: unknown; prefetch: unknown }> = []
vi.mock('next/link', () => ({ default: (props: { href: unknown; prefetch?: unknown; children: ReactNode }) => (seen.push({ href: props.href, prefetch: props.prefetch }), props.children) }))
vi.mock('../navigation', () => ({ Link: (props: { href: unknown; prefetch?: unknown; children: ReactNode }) => (seen.push({ href: props.href, prefetch: props.prefetch }), props.children) }))

const { Link, leavesForEnglish } = await import('./localized-link')
const { NoLinkPrefetch } = await import('./link-prefetch')
const { TranslatedPathsProvider } = await import('./translated-paths')

function prefetchOf(href: string, locale: 'en' | 'zh', publicPage: boolean, prefetch?: boolean) {
  seen.length = 0
  let tree: ReactNode = createElement(Link, { href, prefetch }, 'x')
  if (publicPage) tree = createElement(NoLinkPrefetch, null, tree)
  const paths: ComponentProps<typeof TranslatedPathsProvider> = { paths: ['/', '/pricing'], children: tree }
  tree = createElement(TranslatedPathsProvider, paths)
  const provider: ComponentProps<typeof NextIntlClientProvider> = { locale, messages: {}, children: tree }
  renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
  return seen[0]?.prefetch
}

describe('Link prefetch', () => {
  it('is off on public pages, unless a link asks for it', () => {
    expect(prefetchOf('/pricing', 'en', true)).toBe(false)
    expect(prefetchOf('/pricing', 'zh', true)).toBe(false)
    expect(prefetchOf('/pricing', 'en', true, true)).toBe(true)
  })

  it("keeps Next's default in the app", () => {
    expect(prefetchOf('/photos', 'en', false)).toBeUndefined()
  })

  it('is never on for an English-only page linked from a Chinese page, anywhere', () => {
    expect(prefetchOf('/terms', 'zh', false)).toBe(false)
    expect(leavesForEnglish('/terms', undefined, 'zh', ['/', '/pricing'])).toBe(true)
    expect(leavesForEnglish({ pathname: '/refund-policy' }, undefined, 'zh', ['/'])).toBe(true)
    expect(leavesForEnglish('/pricing', undefined, 'zh', ['/', '/pricing'])).toBe(false)
    expect(leavesForEnglish('/terms', undefined, 'en', ['/'])).toBe(false)
    expect(leavesForEnglish('/terms', 'en', 'zh', ['/'])).toBe(false) // an explicit language switch
  })
})
