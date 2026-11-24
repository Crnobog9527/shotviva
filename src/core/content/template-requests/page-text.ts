import type { FaqItem, HeadedText, RelatedLink } from '../page-content'

// /template-requests (Owner 2026-11-25): the public page for the template wishlist. The copy per
// language lives in site/content; the lists come from the wishlist (core/wishlist public-wall).
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
  wanted: {
    heading: string
    intro: string
    // The wall has no live request yet.
    empty: string
    // Shown in the "In voting" badge; shipped requests go to their own section.
    voting: string
    // "{count}" is replaced by the number.
    votes: { one: string; other: string }
  }
  shipped: { heading: string; intro: string; badge: string; open: string }
  good: { heading: string; intro: string; points: readonly HeadedText[]; examplesHeading: string; examples: readonly string[] }
  today: { heading: string; links: readonly RelatedLink[] }
  faqHeading: string
  faq: readonly FaqItem[]
}

export function votesLabel(text: TemplateRequestsText['wanted']['votes'], count: number): string {
  return (count === 1 ? text.one : text.other).replace('{count}', String(count))
}
