import { pageGate } from '@/core/content'
import { closedSeoFileResponse, llmsTxt, textResponse } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { contentPagesIn, creditFacts, fillCredits, homePageIn } from '@/site/content'
import { displayProducts } from '@/site/billing/display-products'
import { llmsPricingLine } from '@/site/content/llms-pages'
import { site } from '@/site/site.config'

// 404 while the pre-launch switch is closed (ARCHITECTURE §12.0). The descriptions and the
// direct answer carry the free-image count, filled from the catalogue like the pages (T91).
export async function GET() {
  const closed = await closedSeoFileResponse()
  if (closed) return closed
  const [templates, zhTemplates, products] = await Promise.all([cachedWebCatalogue('en'), cachedWebCatalogue('zh'), displayProducts()])
  const facts = creditFacts(templates)
  const homePage = homePageIn('en', products)
  const contentPages = contentPagesIn('en', products)
  const pages = [homePage, ...contentPages].map((page) => ({
    ...pageGate(page),
    title: page.title,
    description: fillCredits(page.description, facts),
  }))
  // SEO patch v5 item 5: /pricing (the three monthly prices) and the Chinese home page, after the
  // existing entries, which stay as they were.
  const pricing = llmsPricingLine(products)
  const zhHome = homePageIn('zh', products)
  const extra = [
    ...(pricing ? [pricing] : []),
    { ...pageGate(zhHome), locale: 'zh' as const, title: zhHome.title, description: fillCredits(zhHome.description, creditFacts(zhTemplates)) },
  ]
  return textResponse(llmsTxt(site, fillCredits(homePage.answerBlock, facts), [...pages, ...extra]))
}
