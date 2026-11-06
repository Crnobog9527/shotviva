'use client'

import NextLink from 'next/link'
import { useLocale } from 'next-intl'
import type { ComponentProps } from 'react'

import { DEFAULT_LOCALE } from '../locales'
import { Link as IntlLink } from '../navigation'
import { matchesPaths } from '../paths'
import { useTranslatedPaths } from './translated-paths'

type Props = ComponentProps<typeof IntlLink>

function hrefPath(href: Props['href']): string {
  return typeof href === 'string' ? href : (href.pathname ?? '/')
}

// next/link for in-site paths: `/photos` stays in the current language (`/zh/photos` on a
// Chinese page), while a target that is English-only (legal pages, SEO inner pages) links to
// its plain English address (`/terms`, not a /zh 404 nor next-intl's redirecting `/en/terms`),
// ARCHITECTURE §17.
export function Link({ locale, href, ...rest }: Props) {
  const current = useLocale()
  const paths = useTranslatedPaths()
  const englishOnly = !locale && current !== DEFAULT_LOCALE && !matchesPaths(hrefPath(href), paths)
  if (englishOnly) return <NextLink href={href} {...rest} />
  return <IntlLink href={href} locale={locale} {...rest} />
}
