import { pageGate } from '@/core/content'
import { closedSeoFileResponse, llmsTxt, textResponse } from '@/core/seo'
import { contentPages, homePage } from '@/site/content'
import { site } from '@/site/site.config'

const pages = [homePage, ...contentPages].map((page) => ({
  ...pageGate(page),
  title: page.title,
  description: page.description,
}))

// 404 while the pre-launch switch is closed (ARCHITECTURE §12.0).
export function GET() {
  return closedSeoFileResponse() ?? textResponse(llmsTxt(site, homePage.answerBlock, pages))
}
