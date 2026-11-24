import type { FaqItem, HeadedText, RelatedLink, WishlistPromo } from '../page-content'

// /template-requests (Owner 2026-11-25): the public page for the template wishlist. The copy per
// language lives in site/content. It never shows a real request: the wall is fictional examples,
// and "recently built" lists only template names (core/wishlist public-wall).
export const TEMPLATE_REQUESTS_PATH = '/template-requests'

export type TemplateRequestsText = {
  path: typeof TEMPLATE_REQUESTS_PATH
  // The breadcrumb's name.
  label: string
  title: string
  description: string
  h1: string
  intro: string
  cta: {
    // Opens the wishlist's own form (/wishlist/new); the proxy asks a signed-out visitor to sign in.
    submit: string
    // Opens the wall (/wishlist), where voting happens.
    vote: string
  }
  // Shown instead of the two buttons while the wishlist is switched off (ARCHITECTURE §15.6).
  closed: string
  steps: { heading: string; items: readonly [HeadedText, HeadedText, HeadedText] }
  // Fictional example wishes (the home page's former wishlist showcase), framed as examples.
  examples: { heading: string; intro: string; wall: Pick<WishlistPromo, 'examples' | 'note' | 'labels'> }
  // Templates built from requests: their names only, never the request text or its author.
  shipped: { heading: string; intro: string; open: string }
  good: { heading: string; intro: string; points: readonly HeadedText[]; examplesHeading: string; examples: readonly string[] }
  today: { heading: string; links: readonly RelatedLink[] }
  faqHeading: string
  faq: readonly FaqItem[]
}
