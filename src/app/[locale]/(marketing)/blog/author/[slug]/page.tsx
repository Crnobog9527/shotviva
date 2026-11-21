import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { authorByName, authorBySlug, authorCrumbs, authorMetadata, cachedPublishedPosts, profilePageLd } from '@/core/blog'
import { AuthorView } from '@/core/blog/ui'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, breadcrumbListLd } from '@/core/seo'
import { BLOG_AUTHORS } from '@/site/content/blog-authors'
import { site } from '@/site/site.config'

// A blog author's page (core/blog/authors.ts): the profile in this language and their published
// posts here, from the cached list read that every admin write expires. Only registered authors
// have a page; any other address is a 404. Indexable once they have a post in this language.

export function generateStaticParams() {
  return BLOG_AUTHORS.map((author) => ({ slug: author.slug }))
}

async function load(params: Promise<{ slug: string }>) {
  const locale = await currentLocale()
  const { slug } = await params
  const author = authorBySlug(BLOG_AUTHORS, slug)
  if (!author) notFound()
  const other = locale === 'en' ? 'zh' : 'en'
  const theirs = (posts: Awaited<ReturnType<typeof cachedPublishedPosts>>) => posts.filter((post) => authorByName([author], post.authorName))
  const [posts, otherPosts] = await Promise.all([cachedPublishedPosts(locale).then(theirs), cachedPublishedPosts(other).then(theirs)])
  return { locale, author, posts, otherHasPosts: otherPosts.length > 0 }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/blog/author/[slug]'>): Promise<Metadata> {
  const { locale, author, posts, otherHasPosts } = await load(params)
  return authorMetadata(site, author, locale, { hasPosts: posts.length > 0, otherHasPosts })
}

export default async function BlogAuthorRoute({ params }: PageProps<'/[locale]/blog/author/[slug]'>) {
  const { locale, author, posts } = await load(params)
  const t = await getTranslations({ locale, namespace: 'blog' })
  const labels = { home: t('home'), blog: t('crumb') }
  return (
    <>
      <JsonLdScript data={[profilePageLd(site, author, locale), breadcrumbListLd(site, authorCrumbs(author, locale, labels))]} />
      <AuthorView
        author={author}
        locale={locale}
        posts={posts}
        text={{ ...labels, by: t('by'), roles: t('authorRoles'), awards: t('authorAwards'), brands: t('authorBrands'), posts: t('authorPosts', { name: author.name }), noPosts: t('authorNoPosts') }}
      />
    </>
  )
}
