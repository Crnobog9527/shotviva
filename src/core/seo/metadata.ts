import type { Metadata } from 'next'

import type { ModuleId, SiteConfig } from '../config'
import { INDEX, NOINDEX, isIndexable } from './indexing'
import { absoluteUrl, siteOrigin } from './site-url'

// Root default: nothing is indexable unless a page opts in through pageMetadata.
export function rootMetadata(site: SiteConfig): Metadata {
  return {
    metadataBase: new URL(siteOrigin(site)),
    title: site.brand.name,
    applicationName: site.brand.name,
    robots: NOINDEX,
  }
}

// Logged-in app shell, admin, account: always out of search (建站规格 R6).
export function appShellMetadata(): Metadata {
  return { robots: NOINDEX }
}

export type PageMetaInput = { path: string; title: string; description: string; module?: ModuleId }

export function pageMetadata(site: SiteConfig, input: PageMetaInput): Metadata {
  const url = absoluteUrl(site, input.path)
  return {
    title: { absolute: input.title },
    description: input.description,
    alternates: { canonical: url },
    robots: isIndexable(site, input.path, [input]) ? INDEX : NOINDEX,
    openGraph: {
      type: 'website',
      siteName: site.brand.name,
      title: input.title,
      description: input.description,
      url,
    },
    twitter: { card: 'summary_large_image', title: input.title, description: input.description },
  }
}
