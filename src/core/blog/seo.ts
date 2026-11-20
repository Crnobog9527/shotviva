import type { Metadata } from 'next'

import type { SiteConfig } from '../config'
import { hreflang, type Locale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'
import { absoluteUrl } from '../seo/site-url'
import { INDEX, notIndexedRobots } from '../seo/indexing'
import { indexingOpenNow } from '../seo/indexing-now'
import { BLOG_PATH, postPath, type Post, type PostSummary } from './rules'

// Blog SEO (ARCHITECTURE §12.6, 建站规格 R7). A blog page is indexable when the site-wide
// pre-launch switch is open (the one switch every page obeys, AGENTS §9) and it has something
// to show: a published post, or a list with at least one. Everything else renders noindex.

const robots = (indexable: boolean) => (indexable && indexingOpenNow() ? INDEX : notIndexedRobots())

// The cover as an absolute URL, or the site's default share card.
function shareImage(site: SiteConfig, cover: string | null, alt: string | null) {
  if (cover) return { url: cover.startsWith('/') ? absoluteUrl(site, cover) : cover, alt: alt ?? undefined }
  const { path, width, height, alt: siteAlt } = site.brand.shareImage
  return { url: absoluteUrl(site, path), width, height, alt: siteAlt }
}

type ListText = { title: string; description: string }

// The two languages' list pages are each other's twins once both have a post.
export function blogListMetadata(site: SiteConfig, locale: Locale, text: ListText, state: { hasPosts: boolean; otherHasPosts: boolean }): Metadata {
  const url = absoluteUrl(site, localizePath(BLOG_PATH, locale))
  const other = locale === 'en' ? 'zh' : 'en'
  const languages =
    state.hasPosts && state.otherHasPosts
      ? { [hreflang(locale)]: url, [hreflang(other)]: absoluteUrl(site, localizePath(BLOG_PATH, other)), 'x-default': absoluteUrl(site, BLOG_PATH) }
      : undefined
  const image = shareImage(site, null, null)
  return {
    title: { absolute: text.title },
    description: text.description,
    alternates: { canonical: url, languages },
    robots: robots(state.hasPosts),
    openGraph: { type: 'website', siteName: site.brand.name, title: text.title, description: text.description, url, locale: locale === 'zh' ? 'zh_CN' : 'en_US', images: [image] },
    twitter: { card: 'summary_large_image', title: text.title, description: text.description, images: [image] },
  }
}

// hreflang only where the other language's version of this very post exists (same slug).
export function postMetadata(site: SiteConfig, post: Post, otherExists: boolean): Metadata {
  const path = postPath(post.slug)
  const url = absoluteUrl(site, localizePath(path, post.locale))
  const other = post.locale === 'en' ? 'zh' : 'en'
  const languages = otherExists
    ? { [hreflang(post.locale)]: url, [hreflang(other)]: absoluteUrl(site, localizePath(path, other)), 'x-default': absoluteUrl(site, localizePath(path, 'en')) }
    : undefined
  const image = shareImage(site, post.coverUrl, post.coverAlt)
  return {
    title: { absolute: `${post.title} | ${site.brand.name}` },
    description: post.description,
    alternates: { canonical: url, languages },
    robots: robots(true),
    authors: [{ name: post.authorName }],
    openGraph: {
      type: 'article',
      siteName: site.brand.name,
      title: post.title,
      description: post.description,
      url,
      locale: post.locale === 'zh' ? 'zh_CN' : 'en_US',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.authorName],
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: post.title, description: post.description, images: [image] },
  }
}

// schema.org Article (建站规格 R7); the date fields are the dates the page shows.
export function articleLd(site: SiteConfig, post: PostSummary): Record<string, unknown> {
  const url = absoluteUrl(site, localizePath(postPath(post.slug), post.locale))
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: post.locale === 'zh' ? 'zh-Hans' : 'en',
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: post.authorName },
    publisher: { '@type': 'Organization', name: site.brand.name, logo: { '@type': 'ImageObject', url: absoluteUrl(site, site.brand.logoPath) } },
    image: [shareImage(site, post.coverUrl, post.coverAlt).url],
  }
}

// Home > Blog > post, in the post's own language.
export function postCrumbs(post: PostSummary, labels: { home: string; blog: string }) {
  return [
    { name: labels.home, path: localizePath('/', post.locale) },
    { name: labels.blog, path: localizePath(BLOG_PATH, post.locale) },
    { name: post.title, path: localizePath(postPath(post.slug), post.locale) },
  ]
}
