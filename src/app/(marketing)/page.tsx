import type { Metadata } from 'next'

import { ContentPageView, TemplateGrid } from '@/core/content'
import { JsonLdScript, faqPageLd, organizationLd, pageMetadata, softwareApplicationLd } from '@/core/seo'
import { homePage, isLinkEnabled } from '@/site/content'
import { site } from '@/site/site.config'

const meta = { path: '/', title: homePage.title, description: homePage.description }

export const metadata: Metadata = pageMetadata(site, meta)

export default function HomePage() {
  return (
    <>
      <JsonLdScript
        data={[softwareApplicationLd(site, meta), organizationLd(site), faqPageLd(homePage.faq)]}
      />
      <ContentPageView
        page={homePage}
        afterHero={<TemplateGrid grid={homePage.templateGrid} />}
        isLinkEnabled={isLinkEnabled}
        relatedHeading="Explore"
      />
    </>
  )
}
