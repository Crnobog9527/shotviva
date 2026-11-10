import { pageGate } from '@/core/content'
import { closedSeoFileResponse, llmsTxt, textResponse } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { contentPagesIn, creditFacts, fillCredits, homePageIn } from '@/site/content'
import { displayProducts } from '@/site/billing/display-products'
import { site } from '@/site/site.config'

// 404 while the pre-launch switch is closed (ARCHITECTURE §12.0). The descriptions and the
// direct answer carry the free-image count, filled from the catalogue like the pages (T91).
export async function GET() {
  const closed = await closedSeoFileResponse()
  if (closed) return closed
  const [templates, products] = await Promise.all([cachedWebCatalogue('en'), displayProducts()])
  const facts = creditFacts(templates)
  const homePage = homePageIn('en', products)
  const contentPages = contentPagesIn('en', products)
  const pages = [homePage, ...contentPages].map((page) => ({
    ...pageGate(page),
    title: page.title,
    description: fillCredits(page.description, facts),
  }))
  return textResponse(llmsTxt(site, fillCredits(homePage.answerBlock, facts), pages))
}
