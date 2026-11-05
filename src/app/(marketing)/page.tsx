import type { Metadata } from 'next'

import { HomePageView } from '@/core/content'
import { JsonLdScript, faqPageLd, organizationLd, pageMetadata, softwareApplicationLd } from '@/core/seo'
import { freeImagesLabel, homePage, isLinkEnabled } from '@/site/content'
import { site } from '@/site/site.config'

const meta = { path: '/', title: homePage.title, description: homePage.description }

export const metadata: Metadata = pageMetadata(site, meta)

export default function HomePage() {
  return (
    <>
      <JsonLdScript
        data={[softwareApplicationLd(site, meta, freeImagesLabel), organizationLd(site), faqPageLd(homePage.faq)]}
      />
      <HomePageView page={homePage} isLinkEnabled={isLinkEnabled} />
    </>
  )
}
