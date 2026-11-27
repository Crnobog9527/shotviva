import { cachedPublishedPosts, postPath } from '@/core/blog'
import { pageGate } from '@/core/content'
import { LOCALES } from '@/core/i18n/locales'
import { closedSeoFileResponse, llmsTxt, textResponse } from '@/core/seo'
import { cachedWebCatalogue } from '@/core/templates/cached-catalogue'
import { contentPagesIn, creditFacts, fillCredits, homePageIn } from '@/site/content'
import { displayProducts } from '@/site/billing/display-products'
import { signupGiftCreditsForSite } from '@/site/billing/signup-gift'
import { llmsPricingLine } from '@/site/content/llms-pages'
import { site } from '@/site/site.config'

// 404 while the pre-launch switch is closed (ARCHITECTURE §12.0). The descriptions and the
// direct answer carry the free-image count, filled from the catalogue like the pages (T91), and the
// signup gift from its setting (2008).
export async function GET() {
  const closed = await closedSeoFileResponse()
  if (closed) return closed
  const [templates, zhTemplates, products, gift] = await Promise.all([cachedWebCatalogue('en'), cachedWebCatalogue('zh'), displayProducts(), signupGiftCreditsForSite()])
  const facts = creditFacts(templates, gift)
  const homePage = homePageIn('en', products)
  const contentPages = contentPagesIn('en', products)
  const pages = [homePage, ...contentPages].map((page) => ({
    ...pageGate(page),
    title: page.title,
    description: fillCredits(page.description, facts),
  }))
  // SEO patch v5 item 5: /pricing (the three monthly prices) and the Chinese home page, after the
  // existing entries, which stay as they were.
  const line = llmsPricingLine(products)
  const pricing = line ? { ...line, description: fillCredits(line.description, facts) } : undefined
  const zhHome = homePageIn('zh', products)
  const extra = [
    ...(pricing ? [pricing] : []),
    { ...pageGate(zhHome), locale: 'zh' as const, title: zhHome.title, description: fillCredits(zhHome.description, creditFacts(zhTemplates, gift)) },
  ]
  const posts = (await Promise.all(LOCALES.map(async (locale) => (await cachedPublishedPosts(locale)).map((post) => ({ path: postPath(post.slug), title: post.title, description: post.description, locale }))))).flat()
  return textResponse(llmsTxt(site, fillCredits(homePage.answerBlock, facts), [...pages, ...extra], posts))
}
