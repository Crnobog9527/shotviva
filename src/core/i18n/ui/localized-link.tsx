'use client'

import NextLink from 'next/link'
import { useLocale } from 'next-intl'
import { useState, type ComponentProps } from 'react'

import { navTypesFor } from '../../ui/nav-motion'
import { DEFAULT_LOCALE, isLocale } from '../locales'
import { Link as IntlLink } from '../navigation'
import { localizePath, matchesPaths } from '../paths'
import { useLinkPrefetchOff } from './link-prefetch'
import { useTranslatedPaths } from './translated-paths'

type Props = ComponentProps<typeof IntlLink>

function hrefPath(href: Props['href']): string {
  return typeof href === 'string' ? href : (href.pathname ?? '/')
}

// A link on a non-English page whose target has no version in that language.
export function leavesForEnglish(href: Props['href'], locale: Props['locale'], current: string, translated: readonly string[]): boolean {
  return !locale && current !== DEFAULT_LOCALE && !matchesPaths(hrefPath(href), translated)
}

// next/link for in-site paths: `/photos` stays in the current language (`/zh/photos` on a
// Chinese page), while a target that is English-only (legal pages, SEO inner pages) links to
// its plain English address (`/terms`, not a /zh 404 nor next-intl's redirecting `/en/terms`),
// ARCHITECTURE §17.
// Inside the app a click carries the page transition's direction (T56, ui/nav-motion), worked
// out at click time, so no link needs the pathname while rendering.
export function Link({ locale, href, prefetch, ...rest }: Props) {
  const current = useLocale()
  const paths = useTranslatedPaths()
  // On public pages, click-only unless the caller asks (link-prefetch.tsx).
  const prefetchOff = useLinkPrefetchOff()
  const motion = useMotionTypes(href, locale, rest)
  // Never prefetched: the target sits under the other language's root, so the click is a full
  // page load and a prefetch could not be used; asking for it sent the router into a loop
  // (production 2026-11-12: a Chinese page with the footer in view requested the English root's
  // segments for /terms, /privacy and /refund-policy many times a second), and the English
  // page's payload preloads Instrument Serif, which a Chinese page then downloaded for nothing.
  if (leavesForEnglish(href, locale, current, paths)) return <NextLink href={href} {...rest} prefetch={false} />
  const linkPrefetch = prefetch ?? (prefetchOff ? false : undefined)
  // next-intl writes `/#templates` as `/zh/#templates`; the home page's anchors and queries keep
  // the no-trailing-slash rule (建站规格 R4): `/zh#templates`.
  if (!locale && isLocale(current) && current !== DEFAULT_LOCALE && typeof href === 'string' && /^\/[#?]/.test(href)) {
    return <NextLink href={localizePath(href, current)} prefetch={linkPrefetch} {...rest} />
  }
  return <IntlLink href={href} locale={locale} prefetch={linkPrefetch} {...rest} {...motion} />
}

// A caller's own onNavigate or transitionTypes wins; a language switch or an object href keeps
// the plain Link. Otherwise the Link gets one array of its own as transitionTypes and fills it
// in onNavigate, which next/link calls on the click just before it navigates with that array
// (next/dist/client/app-dir/link.js linkClicked). The click keeps everything else Link does:
// prefetch, replace, scroll, link status.
function useMotionTypes(href: Props['href'], locale: Props['locale'], rest: Omit<Props, 'href' | 'locale'>): Pick<Props, 'onNavigate' | 'transitionTypes'> {
  const [types] = useState<string[]>(() => [])
  if (rest.onNavigate || rest.transitionTypes || locale || typeof href !== 'string' || !href.startsWith('/')) return {}
  return {
    transitionTypes: types,
    onNavigate: () => {
      types.splice(0, types.length, ...(navTypesFor(href) ?? []))
    },
  }
}
