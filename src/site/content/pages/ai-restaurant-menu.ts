import { defineContentPage, type CostBills } from '@/core/content'

import { site } from '../../site.config'
import { CATEGORY, pairImage, sizeCountWord } from '../landing-shared'
import { pricingRelated } from '../shared'
import {
  foodHalfDayUsd,
  freeImagesLabel,
  FreeImagesShort,
  fromCredits,
  MENU_DISHES,
  OUTPUT_TIERS,
  photoSeconds,
  planFrom,
  tierList,
  usd,
  usdRange,
} from '../offer'
import { PLATFORM_SPECS, px } from '../platform-specs'

// /ai-restaurant-menu (建站规格 §4 第一批: "工具页 + 菜单模板 + 尺寸事实", keyword "ai restaurant
// menu"; a vertical page, so "restaurant" may sit in its Title and H1). Layout from the v3-b
// landing comp (T44). Delivery-app figures: platform-specs.ts; the food photographer's rate:
// site.config. None of the three apps' help pages says anything about AI photos, so the page
// claims nothing either way: it says the photo is of the dish you serve.
const brand = site.brand.name
const [, hd] = OUTPUT_TIERS
const { doordash, uberEats, grubhub } = PLATFORM_SPECS

function menuBills(): CostBills {
  const plan = planFrom ? usd(planFrom.priceUsd) : ''
  return {
    heading: `What Menu Photos Cost: Food Photographer vs ${brand}`,
    intro: `${MENU_DISHES} dishes for a menu and a delivery app. The same job, two bills.`,
    photographer: {
      title: "A food photographer's quote",
      total: { amount: usdRange(foodHalfDayUsd), when: 'a half-day shoot, plus edits' },
      lines: [
        { label: 'Half-day food shoot', value: usdRange(foodHalfDayUsd) },
        { label: 'Food stylist', value: 'usually extra' },
        { label: 'Booking, shoot, edits', value: 'days' },
      ],
      fine: `Published US half-day food photography rates, 2025–2026 (PricingLink, Jobbers, FoodShot): about ${usdRange(foodHalfDayUsd)}; food stylists are usually billed separately. Your quotes will vary.`,
    },
    site: {
      title: brand,
      total: { prefix: 'from', amount: plan, suffix: '/month', when: `about ${photoSeconds} seconds a photo` },
      lines: [
        { label: `Starter plan, ${planFrom?.credits ?? ''} credits a month`, value: plan },
        { label: 'Start with', value: 'One phone photo per dish' },
        { label: 'Make', value: 'Menu photos, delivery listings and promo posters' },
      ],
      fine: `Shoot each dish on the pass with a phone; the template does the light and the styling. Start with ${freeImagesLabel}, no card needed.`,
    },
  }
}

export const aiRestaurantMenu = defineContentPage({
  slug: 'ai-restaurant-menu',
  keyword: 'ai restaurant menu',
  label: 'AI restaurant menu photos',
  module: 'image',
  title: `AI Restaurant Menu Photos From Your Phone (2026) | ${brand}`,
  description: `AI restaurant menu photos from the dish photo you already took: delivery-app, menu and promo shots with the plate kept as served. ${FreeImagesShort}.`,
  h1: 'AI Restaurant Menu Photos From One Phone Shot',
  subtitle: 'Menu, delivery-app and promo photos of the dishes you already serve, shot on the pass with a phone.',
  answerBlock: `AI restaurant menu photos start from the dish photo you already took and turn it into a menu, delivery-app or promo image, with the plate kept as served. With ${brand} you upload one phone photo, pick Delivery Menu, Dark Dining or Promo Poster, and download it in ${tierList}. New users get ${freeImagesLabel}.`,
  hero: {
    before: pairImage('example-dish-before', 'Phone photo of a dish on a restaurant kitchen pass, harsh overhead light (illustrative example)'),
    after: pairImage('example-dish-after', 'The same dish as a bright delivery-app photo, soft daylight, Delivery Menu template (illustrative example)'),
    caption: 'Your phone photo → Delivery Menu template: same plate, brighter light · Illustrative example',
    cta: { label: 'Upload photo', href: '/generate' },
  },
  facts: [
    {
      label: `DoorDash: Landscape ${doordash.ratio}, ${px(doordash.minW)} × ${px(doordash.minH)} px or More`,
      value: `DoorDash asks for landscape ${doordash.ratio} photos of at least ${px(doordash.minW)} × ${px(doordash.minH)} px that show the actual item served. Banner 16:9 at ${hd.name} is ${px(hd.px)} × ${px(Math.round((hd.px * 9) / 16))} px.`,
    },
    {
      label: 'Uber Eats and Grubhub',
      value: `Uber Eats recommends ${uberEats.ratio} at ${px(uberEats.minW)} × ${px(uberEats.minH)} px or more, one item per photo; Grubhub uses square photos of at least ${px(grubhub.minPx)} × ${px(grubhub.minPx)} px. Rental 3:2 suits Uber Eats, Listing 1:1 suits Grubhub; all ${sizeCountWord} sizes are PNG.`,
    },
    {
      label: 'The Dish Stays the Dish',
      value: `Delivery apps want photos of the food you actually serve. ${brand} starts from your own phone photo and changes the light and the background, not the food.`,
    },
  ],
  costBills: menuBills(),
  faq: [
    {
      question: 'Can I use AI photos on my delivery-app menu?',
      answer: `Delivery apps ask for photos that show the dish you actually serve. ${brand} starts from your own phone photo and keeps the plate as served, changing only the light and background, so the photo is still of your food. Check your app's current photo rules before you upload.`,
    },
    {
      question: 'What size should restaurant menu photos be?',
      answer: `DoorDash wants landscape ${doordash.ratio} at ${px(doordash.minW)} × ${px(doordash.minH)} px or more, Uber Eats ${uberEats.ratio}, Grubhub square. Printed menus and Instagram use 4:5 or 1:1. ${brand} exports PNG in ${tierList}, in ${sizeCountWord} sizes.`,
    },
    {
      question: 'How much does a food photographer cost?',
      answer: `Published US rates are about ${usdRange(foodHalfDayUsd)} for a half day, with a food stylist usually billed separately. ${brand} makes a menu photo from your phone shot ${fromCredits}.`,
    },
    {
      question: 'Do I need to write prompts?',
      answer:
        'No. Pick Delivery Menu, Dark Dining or Promo Poster and the template carries the light and the styling. One optional line, "Anything to change?", takes a note like "keep the chilli oil visible".',
    },
    {
      question: 'Can it make the whole menu?',
      answer: `It makes photos, one dish at a time, and a single promo poster. Laying out a multi-dish menu or a price list is not something ${brand} does.`,
    },
  ],
  related: [
    { href: '/', anchor: 'AI image to image', note: 'The studio: templates for food, products, rooms, pets and art styles.' },
    { href: '/commercial-photography', anchor: 'Commercial product photography', note: 'For shops and sellers who need studio product shots without a photographer.' },
    { href: '/image-to-image-generator', anchor: 'Image to image generator', note: 'For anyone who wants to see how image to image works on a photo.' },
    pricingRelated(),
  ],
  headings: {
    facts: 'Menu and Delivery-App Photo Sizes',
    faq: 'AI Restaurant Menu Photo FAQ',
    related: `More From ${brand}`,
  },
  landing: {
    factsNote: 'From the apps\' own merchant help pages (DoorDash, Uber Eats, Grubhub), checked November 2026. Apps change their rules; check before you upload.',
    templates: {
      heading: 'Menu Photo Templates for Delivery Apps, Menus and Posters',
      intro: `Every template starts from your phone photo of the dish and ends with a menu-ready photo, ${fromCredits}.`,
      categoryKeys: [CATEGORY.food],
    },
  },
})
