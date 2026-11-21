import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { blogListMetadata, cachedPublishedPosts } from '@/core/blog'
import { BlogListView } from '@/core/blog/ui'
import { currentLocale } from '@/core/i18n/server'
import { BLOG_AUTHORS } from '@/site/content/blog-authors'
import { site } from '@/site/site.config'

// The blog list (ARCHITECTURE §12.6): published posts of this language from the cached read,
// which every admin publish, edit and take-down expires.
async function load() {
  const locale = await currentLocale()
  const other = locale === 'en' ? 'zh' : 'en'
  const [posts, otherPosts, t] = await Promise.all([cachedPublishedPosts(locale), cachedPublishedPosts(other), getTranslations({ locale, namespace: 'blog' })])
  return { locale, posts, otherHasPosts: otherPosts.length > 0, t }
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale, posts, otherHasPosts, t } = await load()
  return blogListMetadata(site, locale, { title: t('metaTitle'), description: t('metaDescription') }, { hasPosts: posts.length > 0, otherHasPosts })
}

export default async function BlogIndexRoute() {
  const { locale, posts, t } = await load()
  return <BlogListView posts={posts} locale={locale} authors={BLOG_AUTHORS} text={{ title: t('listTitle'), intro: t('listIntro'), empty: t('listEmpty'), by: t('by') }} />
}
