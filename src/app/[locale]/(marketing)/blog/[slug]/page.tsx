import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { SLUG_PATTERN, articleLd, cachedPublishedPost, cachedPublishedPosts, postCrumbs, postMetadata } from '@/core/blog'
import { ArticleView } from '@/core/blog/ui'
import { isLocale, type Locale } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, breadcrumbListLd } from '@/core/seo'
import { site } from '@/site/site.config'

// One blog post (ARCHITECTURE §12.6). Posts published after the build render on their first
// visit and are then kept like the prerendered ones; a publish, edit or take-down expires the
// cached reads (blog tag), so the next visit shows it. A draft or unknown address is a real 404.

// Cache Components rejects an empty list; with no post yet, one placeholder resolves to 404.
const NO_POSTS = [{ slug: '__no-blog-posts__' }]

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : 'en'
  const slugs = (await cachedPublishedPosts(locale)).map((post) => ({ slug: post.slug }))
  return slugs.length > 0 ? slugs : NO_POSTS
}

async function load(params: Promise<{ slug: string }>) {
  const locale = await currentLocale()
  const { slug } = await params
  // Anything that cannot be a post's address is a 404 before any cache entry or query.
  if (slug.length > 100 || !SLUG_PATTERN.test(slug)) notFound()
  const post = await cachedPublishedPost(locale, slug)
  if (!post) notFound()
  const otherExists = (await cachedPublishedPost(locale === 'en' ? 'zh' : 'en', slug)) !== null
  return { locale, post, otherExists }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/blog/[slug]'>): Promise<Metadata> {
  const { post, otherExists } = await load(params)
  return postMetadata(site, post, otherExists)
}

export default async function BlogPostRoute({ params }: PageProps<'/[locale]/blog/[slug]'>) {
  const { locale, post } = await load(params)
  const t = await getTranslations({ locale, namespace: 'blog' })
  const labels = { home: t('home'), blog: t('crumb') }
  return (
    <>
      <JsonLdScript data={[articleLd(site, post), breadcrumbListLd(site, postCrumbs(post, labels))]} />
      <ArticleView post={post} text={{ ...labels, by: t('by'), published: t('published'), updated: t('updated'), contents: t('contents') }} />
    </>
  )
}
