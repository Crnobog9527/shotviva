import type { Metadata } from 'next'

import type { SiteConfig } from '../config'
import { hreflang, type Locale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'
import { absoluteUrl } from '../seo/site-url'
import { INDEX, notIndexedRobots } from '../seo/indexing'
import { indexingOpenNow } from '../seo/indexing-now'
import { authorByName, authorPath, type BlogAuthor } from './authors'
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
export function postMetadata(site: SiteConfig, post: Post, otherExists: boolean, authors: readonly BlogAuthor[] = []): Metadata {
  const author = authorByName(authors, post.authorName)
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
    authors: [author ? { name: author.name, url: absoluteUrl(site, localizePath(authorPath(author.slug), post.locale)) } : { name: post.authorName }],
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

// A registered author as a schema.org Person, one @id across every page that names them, linked
// to the profile in the page's language and to the brand they work for. `full` adds what only
// the profile page shows.
export function personLd(site: SiteConfig, author: BlogAuthor, locale: Locale, full = false): Record<string, unknown> {
  const text = author.text[locale]
  return {
    '@type': 'Person',
    '@id': `${absoluteUrl(site, authorPath(author.slug))}#person`,
    name: author.name,
    url: absoluteUrl(site, localizePath(authorPath(author.slug), locale)),
    image: absoluteUrl(site, author.photo.src),
    jobTitle: text.jobTitle,
    worksFor: { '@type': 'Organization', name: site.brand.name, url: absoluteUrl(site, '/') },
    ...(full ? { description: text.intro, knowsAbout: [...author.knowsAbout], award: [...text.awards] } : {}),
  }
}

// The Article's author: a registered author's Person; a team byline naming the brand ("Shotviva
// Team") is the brand Organization, not a person; any other name a Person by name only.
export function authorLd(site: SiteConfig, name: string, locale: Locale, authors: readonly BlogAuthor[]): Record<string, unknown> {
  const author = authorByName(authors, name)
  if (author) return personLd(site, author, locale)
  if (name.toLowerCase().includes(site.brand.name.toLowerCase())) return { '@type': 'Organization', name: site.brand.name, url: absoluteUrl(site, '/') }
  return { '@type': 'Person', name }
}

// schema.org Article (建站规格 R7); the date fields are the dates the page shows.
export function articleLd(site: SiteConfig, post: PostSummary, authors: readonly BlogAuthor[] = []): Record<string, unknown> {
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
    author: authorLd(site, post.authorName, post.locale, authors),
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

// An author's profile. Indexable like a list page: once the author has a published post in this
// language; hreflang once both languages do.
export function authorMetadata(site: SiteConfig, author: BlogAuthor, locale: Locale, state: { hasPosts: boolean; otherHasPosts: boolean }): Metadata {
  const path = authorPath(author.slug)
  const url = absoluteUrl(site, localizePath(path, locale))
  const other = locale === 'en' ? 'zh' : 'en'
  const languages =
    state.hasPosts && state.otherHasPosts
      ? { [hreflang(locale)]: url, [hreflang(other)]: absoluteUrl(site, localizePath(path, other)), 'x-default': absoluteUrl(site, path) }
      : undefined
  const text = author.text[locale]
  const title = `${author.name}, ${text.jobTitle}`
  const image = { url: absoluteUrl(site, author.photo.src), width: author.photo.width, height: author.photo.height, alt: author.name }
  return {
    // The job title often names the brand already; then it is not repeated (建站规格 R3, ≤60).
    title: { absolute: title.includes(site.brand.name) ? title : `${title} | ${site.brand.name}` },
    description: text.intro,
    alternates: { canonical: url, languages },
    robots: robots(state.hasPosts),
    openGraph: { type: 'profile', siteName: site.brand.name, title, description: text.intro, url, locale: locale === 'zh' ? 'zh_CN' : 'en_US', images: [image] },
    twitter: { card: 'summary', title, description: text.intro, images: [image] },
  }
}

// schema.org ProfilePage whose main entity is the author.
export function profilePageLd(site: SiteConfig, author: BlogAuthor, locale: Locale): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: absoluteUrl(site, localizePath(authorPath(author.slug), locale)),
    inLanguage: locale === 'zh' ? 'zh-Hans' : 'en',
    mainEntity: personLd(site, author, locale, true),
  }
}

// Home > Blog > author, in the page's language.
export function authorCrumbs(author: BlogAuthor, locale: Locale, labels: { home: string; blog: string }) {
  return [
    { name: labels.home, path: localizePath('/', locale) },
    { name: labels.blog, path: localizePath(BLOG_PATH, locale) },
    { name: author.name, path: localizePath(authorPath(author.slug), locale) },
  ]
}
