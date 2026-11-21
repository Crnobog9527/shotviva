import type { SiteConfig } from '../config'
import { localizePath } from '../i18n/paths'
import { urlsetXml } from '../seo/sitemap'
import { absoluteUrl } from '../seo/site-url'
import { authorByName, authorPath, type BlogAuthor } from './authors'
import { BLOG_PATH, postPath, type PostSummary } from './rules'

type Entry = Pick<PostSummary, 'locale' | 'slug' | 'updatedAt'> & { authorName?: string }

const day = (iso: string) => iso.slice(0, 10)

// The blog's child sitemap (建站规格 R6): every published post with the day it last changed,
// and each language's list page (as new as that language's newest edit) once that language
// has a post, and each registered author's page in a language where they have a post (as new as
// their newest edit there). Empty while the blog is: an empty <urlset> is valid.
export function blogSitemapXml(site: SiteConfig, posts: readonly Entry[], authors: readonly BlogAuthor[] = []): string {
  const lastmod: Record<string, string> = {}
  const urls: string[] = []
  for (const locale of ['en', 'zh'] as const) {
    const own = posts.filter((post) => post.locale === locale)
    if (own.length === 0) continue
    const list = localizePath(BLOG_PATH, locale)
    lastmod[list] = day(own.map((post) => post.updatedAt).sort().at(-1) as string)
    urls.push(absoluteUrl(site, list))
    for (const post of own) {
      const path = localizePath(postPath(post.slug), locale)
      lastmod[path] = day(post.updatedAt)
      urls.push(absoluteUrl(site, path))
    }
    for (const author of authors) {
      const theirs = own.filter((post) => post.authorName !== undefined && authorByName([author], post.authorName))
      if (theirs.length === 0) continue
      const path = localizePath(authorPath(author.slug), locale)
      lastmod[path] = day(theirs.map((post) => post.updatedAt).sort().at(-1) as string)
      urls.push(absoluteUrl(site, path))
    }
  }
  return urlsetXml(urls, lastmod)
}
