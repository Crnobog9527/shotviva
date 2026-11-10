import type { PaymentChannel, SiteProduct } from '@/core/config'
import type { ContentPage, FaqItem, FooterLink, HomePage } from '@/core/content'
import type { Locale } from '@/core/i18n'

import { homePage } from './home'
import { FreeImagesLabel } from './offer'
import { footerLinks } from './legal'
import { aiRestaurantMenu } from './pages/ai-restaurant-menu'
import { commercialPhotography } from './pages/commercial-photography'
import { imageToImageGenerator } from './pages/image-to-image-generator'
import { makePricingPage, pricingPage, type PricingContent } from './pricing'
import { zhHomePage } from './zh/home'
import { zhAiRestaurantMenu } from './zh/pages/ai-restaurant-menu'
import { zhCommercialPhotography } from './zh/pages/commercial-photography'
import { zhImageToImageGenerator } from './zh/pages/image-to-image-generator'
import { zhFreeImages } from './zh/offer'
import { ALIPAY_QUESTION, ZH_WECHAT_PAY_FAQ, makeZhPricingPage, zhPricingPage } from './zh/pricing'

// Marketing copy per language (ARCHITECTURE §17: body copy lives in site/content by language).
// Every SEO page has a Chinese text (ARCHITECTURE §17); only those in site.indexing are indexable.

const HOME: Record<Locale, HomePage> = { en: homePage, zh: zhHomePage }
const PRICING: Record<Locale, PricingContent> = { en: pricingPage, zh: zhPricingPage }
const INNER: Record<Locale, readonly ContentPage[]> = {
  en: [imageToImageGenerator, commercialPhotography, aiRestaurantMenu],
  zh: [zhImageToImageGenerator, zhCommercialPhotography, zhAiRestaurantMenu],
}

// Legal pages stay English, but their link labels follow the page (建站规格 §6.1 rule 3).
// Contact opens Help & feedback, which has a /zh version.
const ZH_LEGAL_LABELS: Record<string, string> = {
  '/terms': '服务条款',
  '/privacy': '隐私政策',
  '/refund-policy': '退款政策',
  '/acceptable-use': '使用规范',
  // Help & feedback (T27, a dialog on the account page since T68) has a Chinese version.
  '/account?help=new': '联系我们',
}

export const homePageIn = (locale: Locale): HomePage => HOME[locale]
export function pricingPageIn(locale: Locale, products?: readonly SiteProduct[]): PricingContent {
  if (!products) return PRICING[locale]
  return locale === 'zh' ? makeZhPricingPage(products) : makePricingPage(products)
}
// /pricing's FAQ for the live channel (on Waffo a card plan is cancelled from the account page).
// With STRIPE_WECHAT_PAY on (T73, Stripe only) the zh Alipay answer names WeChat Pay too and
// says the wallet is picked on the checkout page; off, it is the pre-T73 text.
export function pricingFaqIn(locale: Locale, channel: PaymentChannel, wechatPay = false, page = PRICING[locale]): readonly FaqItem[] {
  if (channel === 'waffo') return page.waffo.faq
  if (!wechatPay) return page.faq
  return page.faq.map((item) => (item.question === ALIPAY_QUESTION ? ZH_WECHAT_PAY_FAQ : item))
}

// The signup gift on its own (the generator's gift line, the sign-up sheet, JSON-LD's free
// offer), a marker for fillCredits like the page copy: "Up to 6 free Standard images".
export const freeImagesIn = (locale: Locale): string => (locale === 'zh' ? zhFreeImages : FreeImagesLabel)

export const contentPagesIn = (locale: Locale): readonly ContentPage[] => INNER[locale]

export function findContentPageIn(slug: string, locale: Locale): ContentPage | undefined {
  return INNER[locale].find((page) => page.slug === slug)
}

export function footerLinksIn(locale: Locale): readonly FooterLink[] {
  if (locale === 'en') return footerLinks
  return footerLinks.map((link) => ({ ...link, label: ZH_LEGAL_LABELS[link.href] ?? link.label }))
}
