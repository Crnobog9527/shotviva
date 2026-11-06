import { defineContentPage } from '@/core/content'

import { site } from '../../site.config'
import { templateCategories } from '../featured-templates'
import { productBills, shoot } from '../home'
import { homeImage, pickCategories } from '../landing-shared'
import { dayRateUsd, freeImagesLabel, fromCredits, OUTPUT_TIERS, packshotUsd, plansSentence, SET_PHOTOS, styledShotUsd, tierList, usdRange } from '../offer'
import { PLATFORM_SPECS, px } from '../platform-specs'

// /commercial-photography (建站规格 §4 第一批: "替代方案页 + 成本对比", keyword "commercial
// photography"). Layout from the v3-b landing comp (T44). Platform figures: platform-specs.ts;
// prices: site.config. Shotviva never claims a marketplace allows AI photos: it says the photo
// starts from the real product and that the seller checks the platform's rules.
const brand = site.brand.name
const [, hd, max] = OUTPUT_TIERS
const { amazon, etsy, shopify } = PLATFORM_SPECS

export const commercialPhotography = defineContentPage({
  slug: 'commercial-photography',
  keyword: 'commercial photography',
  label: 'Commercial product photography',
  module: 'image',
  title: `Commercial Photography Without a Studio (2026) | ${brand}`,
  description: `Commercial photography from one phone photo: listing shots, lifestyle scenes and promo posters, styled and retouched by a template. ${freeImagesLabel}.`,
  h1: 'Commercial Photography From a Phone Photo, No Studio Booked',
  subtitle: 'Listing shots, lifestyle scenes and promo posters from the product photo you already took.',
  answerBlock: `Commercial photography for a small brand usually means a studio day, a photographer and a retoucher. ${brand} does the same job from one phone photo: upload it, pick a template such as White Background or Lifestyle Table, and download a styled, retouched product shot in ${tierList}. New users get ${freeImagesLabel}.`,
  hero: {
    before: homeImage('hero-set-phone', 'Phone snapshot of a woven leather tote on a busy kitchen counter, window light (illustrative example)'),
    after: homeImage('hero-set-lifestyle', 'The same tote on a café chair by a window in warm morning light, Lifestyle Table template (illustrative example)'),
    caption: 'Your phone photo → Lifestyle Table template: same tote, a styled scene · Illustrative example',
    cta: { label: 'Upload photo', href: '/generate' },
  },
  facts: [
    {
      label: `Amazon: Pure White Main Image, ${px(amazon.zoomPx)} px for Zoom`,
      value: `Amazon wants the main image on pure white and ${px(amazon.minPx)} to ${px(amazon.maxPx)} px on the longest side; over ${px(amazon.zoomPx)} px lets shoppers zoom. White Background at ${hd.name} is ${px(hd.px)} px.`,
    },
    {
      label: `Etsy and Shopify: ${px(etsy.minPx)} px and Up`,
      value: `Etsy asks for photos at least ${px(etsy.minPx)} px wide and tall; Shopify says ${px(shopify.squarePx)} × ${px(shopify.squarePx)} px usually displays best for square images. ${hd.name} (${px(hd.px)} px) and ${max.name} (${px(max.px)} px) clear both.`,
    },
    {
      label: 'It Is Still Your Product',
      value: `Marketplaces want photos of the actual item, and Etsy now asks for at least one unedited photo of it in every listing. ${brand} starts from your photo and keeps the product as shot; check each platform's current rules before you list.`,
    },
  ],
  costBills: productBills(
    `What a Product Shoot Costs: Photographer vs ${brand}`,
    `One product, ${SET_PHOTOS} styled photos, retouched and ready to list. The same job, two bills.`,
    `; a studio day ${usdRange(dayRateUsd)} (Shopify, Jan 2026)`,
  ),
  faq: [
    {
      question: 'How much does commercial product photography cost?',
      answer: `Published 2026 US rates run ${usdRange(packshotUsd)} for a plain packshot, ${usdRange(styledShotUsd)} for a styled shot and ${usdRange(dayRateUsd)} for a studio day. ${brand} makes a styled, retouched photo from your own phone shot ${fromCredits}. ${plansSentence()}`,
    },
    {
      question: 'Can AI replace a product photographer?',
      answer:
        'For listing shots, lifestyle scenes and promo images of a product you can photograph on a phone, yes: the template does the styling and the retouching. For a campaign with models, props and art direction, a photographer still earns the fee.',
    },
    {
      question: 'Are AI product photos allowed on Amazon and Etsy?',
      answer: `Both require images that show the real product accurately, and Etsy now asks for at least one unedited photo of the actual item in each listing. ${brand} starts from your photo and changes only the background, light and scene. Rules change, so check each platform's current image policy before you list.`,
    },
    {
      question: 'Do I own the photos?',
      answer: `Yes. Photos made with paid credits are private, watermark-free and yours to use in listings, ads and social posts. The ${freeImagesLabel} are public with a watermark.`,
    },
    {
      question: 'What should my phone photo look like?',
      answer: 'Daylight, the product in focus, nothing in front of it. A cluttered background is fine; the template replaces it.',
    },
  ],
  related: [
    { href: '/', anchor: 'AI image to image', note: 'The studio: templates for food, products, rooms, pets and art styles.' },
    { href: '/image-to-image-generator', anchor: 'Image to image generator', note: 'For anyone who wants to see how image to image works on a photo.' },
    { href: '/ai-restaurant-menu', anchor: 'AI restaurant menu photos', note: 'For restaurants that need menu and delivery-app photos from a phone shot.' },
  ],
  headings: {
    facts: 'Marketplace Photo Rules Your Shots Will Meet',
    faq: 'Commercial Product Photography FAQ',
    related: `More From ${brand}`,
  },
  landing: {
    generatorTemplate: 'white-background',
    factsNote: 'From the platforms\' own help pages (Amazon, Etsy, Shopify), checked November 2026. Platforms change their rules; check before you list.',
    shoot,
    templates: {
      heading: 'Product Photo Templates: Listings, Scenes and Posters',
      intro: `Every template starts from your phone photo of the product and ends with a finished shot, ${fromCredits}.`,
      categories: pickCategories(templateCategories, ['products', 'beauty']),
    },
  },
})
