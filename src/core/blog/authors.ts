import type { Locale } from '../i18n/locales'

// Blog authors with a profile page (/blog/author/<slug>). A post names its author in free text
// (the admin's 作者名); when that name matches a registered author, the byline links to the
// profile and the Article's schema.org author is that Person with the profile's address. Any
// other name stays plain text. The site lists its authors (site/content/blog-authors.ts).
// Client-safe: no server-only imports.

export type BlogAuthorText = {
  // One line under the name, and schema.org jobTitle.
  jobTitle: string
  // The profile's opening; also its meta description (≤155 characters) and schema.org description.
  intro: string
  roles: readonly string[]
  awards: readonly string[]
  brands: readonly string[]
}

export type BlogAuthor = {
  slug: string
  name: string
  // A /public path, portrait.
  photo: { src: string; width: number; height: number }
  knowsAbout: readonly string[]
  text: Record<Locale, BlogAuthorText>
}

export const AUTHOR_PATH = '/blog/author'
export const authorPath = (slug: string) => `${AUTHOR_PATH}/${slug}`

const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export function authorByName(authors: readonly BlogAuthor[], name: string): BlogAuthor | null {
  return authors.find((author) => key(author.name) === key(name)) ?? null
}

export function authorBySlug(authors: readonly BlogAuthor[], slug: string): BlogAuthor | null {
  return authors.find((author) => author.slug === slug) ?? null
}
