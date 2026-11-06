import type { PaymentChannel } from '@/core/config'
import type { ContentPage, FaqItem, FooterLink, HomePage } from '@/core/content'
import type { Locale } from '@/core/i18n'

import { site } from '../site.config'
import { homePage } from './home'
import { footerLinks } from './legal'
import { imageToImageGenerator } from './pages/image-to-image-generator'
import { pricingPage, type PricingContent } from './pricing'
import { zhHomePage } from './zh/home'
import { zhCountries } from './zh/offer'
import { zhImageToImageGenerator } from './zh/pages/image-to-image-generator'
import { zhPricingPage } from './zh/pricing'

// Marketing copy per language (ARCHITECTURE §17: body copy lives in site/content by language).
// Only the three indexable pages have a Chinese text; legal pages and other SEO inner pages
// are English-only and never rendered under /zh.

const HOME: Record<Locale, HomePage> = { en: homePage, zh: zhHomePage }
const PRICING: Record<Locale, PricingContent> = { en: pricingPage, zh: zhPricingPage }
const INNER: Record<Locale, readonly ContentPage[]> = {
  en: [imageToImageGenerator],
  zh: [zhImageToImageGenerator],
}

// Legal pages stay English, but their link labels follow the page (建站规格 §6.1 rule 3).
// Contact opens Help & feedback, which has a /zh version.
const ZH_LEGAL_LABELS: Record<string, string> = {
  '/terms': '服务条款',
  '/privacy': '隐私政策',
  '/refund-policy': '退款政策',
  '/acceptable-use': '使用规范',
  // Help & feedback (T27) has a Chinese version.
  '/account/help': '联系我们',
}

export const homePageIn = (locale: Locale): HomePage => HOME[locale]
export const pricingPageIn = (locale: Locale): PricingContent => PRICING[locale]
// /pricing's FAQ for the live channel (Waffo is all one-time).
export function pricingFaqIn(locale: Locale, channel: PaymentChannel): readonly FaqItem[] {
  const page = PRICING[locale]
  return channel === 'waffo' ? page.oneTime.faq : page.faq
}

export const contentPagesIn = (locale: Locale): readonly ContentPage[] => INNER[locale]

export function findContentPageIn(slug: string, locale: Locale): ContentPage | undefined {
  return INNER[locale].find((page) => page.slug === slug)
}

export function footerLinksIn(locale: Locale): readonly FooterLink[] {
  if (locale === 'en') return footerLinks
  return footerLinks.map((link) => ({ ...link, label: ZH_LEGAL_LABELS[link.href] ?? link.label }))
}

export function countriesIn(locale: Locale): string {
  return locale === 'zh' ? zhCountries : site.brand.countries.join(', ')
}
