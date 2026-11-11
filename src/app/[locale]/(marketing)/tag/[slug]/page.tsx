import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { cachedTagWorks, findTag, galleryWorkView, isGalleryEnabled, relatedTags } from '@/core/gallery'
import { TagPage } from '@/core/gallery/ui'
import { currentLocale } from '@/core/i18n/server'
import { breadcrumbListLd, JsonLdScript, pageMetadata } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { galleryTags } from '@/site/content/gallery-tags'
import { site } from '@/site/site.config'

// A tag page (ARCHITECTURE §9 第 4 条, 创作库规格 U6–U8, U12): only for whitelisted keywords and
// only while the gallery is open; anything else is a real 404. English only.

// Cache Components needs one entry; with an empty whitelist the placeholder resolves to 404.
export function generateStaticParams() {
  return galleryTags.length > 0 ? galleryTags.map((tag) => ({ slug: tag.slug })) : [{ slug: '__no-tags__' }]
}

async function load(params: Promise<{ slug: string }>) {
  if (!(await isGalleryEnabled(site))) notFound()
  const [locale, { slug }] = await Promise.all([currentLocale(), params])
  const tag = findTag(galleryTags, slug)
  if (!tag || locale !== 'en') notFound()
  const [rows, catalogue] = await Promise.all([cachedTagWorks(tag.templateIds), cachedWebCatalogue(locale)])
  const works = rows.flatMap((row) => galleryWorkView(row, catalogue) ?? [])
  return { tag, works, related: relatedTags(galleryTags, tag) }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/tag/[slug]'>): Promise<Metadata> {
  const { tag } = await load(params)
  return pageMetadata(site, { path: `/tag/${tag.slug}`, title: tag.title, description: tag.description }, 'en')
}

export default async function TagRoute({ params }: PageProps<'/[locale]/tag/[slug]'>) {
  const { tag, works, related } = await load(params)
  const t = await getTranslations({ locale: 'en', namespace: 'gallery' })
  const crumbs = [
    { name: t('footerLink'), path: '/gallery' },
    { name: tag.h1, path: `/tag/${tag.slug}` },
  ]
  return (
    <>
      <JsonLdScript data={[breadcrumbListLd(site, crumbs)]} />
      <TagPage tag={tag} works={works} related={related} relatedLabel={t('related')} />
    </>
  )
}
