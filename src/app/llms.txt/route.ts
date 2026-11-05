import { pageGate } from '@/core/content'
import { llmsTxt, textResponse } from '@/core/seo'
import { contentPages, homePage } from '@/site/content'
import { site } from '@/site/site.config'

const pages = [homePage, ...contentPages].map((page) => ({
  ...pageGate(page),
  title: page.title,
  description: page.description,
}))

export function GET() {
  return textResponse(llmsTxt(site, homePage.answerBlock, pages))
}
