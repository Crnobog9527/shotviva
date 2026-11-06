import type { Metadata } from 'next'

import { HomePageView } from '@/core/content'
import { localizePath } from '@/core/i18n'
import { currentLocale } from '@/core/i18n/server'
import { JsonLdScript, faqPageLd, organizationLd, pageMetadata, softwareApplicationLd } from '@/core/seo'
import { freeImagesLabel, homePageIn, isLinkEnabled } from '@/site/content'
import { zhFreeImages } from '@/site/content/zh/offer'
import { site } from '@/site/site.config'

async function load() {
  const locale = await currentLocale()
  const page = homePageIn(locale)
  return { locale, page, meta: { path: '/', title: page.title, description: page.description } }
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale, meta } = await load()
  return pageMetadata(site, meta, locale)
}

// The home page in the request's language (ARCHITECTURE §17); JSON-LD in the same language.
export default async function HomePage() {
  const { locale, page, meta } = await load()
  const free = locale === 'zh' ? zhFreeImages : freeImagesLabel
  const ldMeta = { ...meta, path: localizePath(meta.path, locale) }
  return (
    <>
      <JsonLdScript data={[softwareApplicationLd(site, ldMeta, free), organizationLd(site), faqPageLd(page.faq)]} />
      <HomePageView page={page} isLinkEnabled={isLinkEnabled} />
    </>
  )
}
