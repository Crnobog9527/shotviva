import type { Metadata } from 'next'

import { LegalPageView } from '@/core/content'
import { pageMetadata } from '@/core/seo'
import { termsPage } from '@/site/content'
import { site } from '@/site/site.config'

// Not in the keyword map CSV, so the global indexing switch renders it noindex (AGENTS §9).
export const metadata: Metadata = pageMetadata(site, termsPage)

export default function TermsPage() {
  return <LegalPageView page={termsPage} />
}
