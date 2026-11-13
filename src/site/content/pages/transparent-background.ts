import { TIER_LIMITS } from '@/core/billing/tier-limits'
import { defineContentPage, type CostBills, type EditCases } from '@/core/content'

import { site } from '../../site.config'
import { caseImage, CATEGORY, sizeCountWord, withFirstFrame } from '../landing-shared'
import { baselineOffers, packshotUsd, photoSeconds, plansSentence, product, tierPixels, uploadLimits, usd, usdRange, type OfferFacts } from '../offer'
import { PLATFORM_SPECS, PLATFORM_SPECS_CHECKED, px } from '../platform-specs'
import { pricingRelated } from '../shared'

// /transparent-background (SEO launch handbook 04-P1, PATCH v3): the first page after the launch
// set. Title, H1 and the five H2s are the handbook's, in its order: Change Background to White
// (the cut-out cases), White Background for Product Photos (the product templates), White
// Background Photo Editor for Online Stores (marketplace rules), Bulk Background Removal for
// Product Catalogs (batch upload is live: Pro and Max), Transparent PNG vs White Background vs
// Listing Photo (one table), then the FAQ. Never "free" in the Title, H1, H2s or buttons; the free
// and paid rules are stated only as the product has them (public, watermarked, non-commercial vs
// private, no watermark, commercial, batch). The generator opens on the cut-out template.
const brand = site.brand.name
const { amazon, etsy, shopify } = PLATFORM_SPECS
const CUT_OUT_TEMPLATE = 'white-background'
// A catalogue of this many products: the bulk bill below.
const CATALOG_PRODUCTS = 10
const { pro, max } = TIER_LIMITS

const dressPhone = caseImage('white-dress-before', 'Real phone photo: an ivory tiered maxi dress with folk flower embroidery hanging on a bedroom door, a bed and a laundry basket in frame')
const dressWhite = caseImage('white-dress-after', 'Real example: the same embroidered dress on a pure white background')

const cutOuts: EditCases = {
  heading: 'Change Background to White',
  intro: `${brand} cuts the product out of the photo you already have. Each result downloads as a transparent PNG or as a white-background version, so one cut-out covers both.`,
  labels: { before: 'Phone photo', after: 'Cut-out', reference: 'Reference' },
  items: [
    {
      title: 'A speaker on a cluttered desk',
      change: 'The cables, the desk mat and the room are gone; the grille, the tweeter and the finish stay. A transparent PNG with a soft shadow, ready for any background.',
      before: caseImage('white-speaker-before', 'Real phone photo: a dark grey studio speaker on a green desk mat, cables and a chair behind it'),
      after: caseImage('white-speaker-after', 'Real example: the same speaker cut out on a transparent background with a soft shadow beneath it'),
      transparent: true,
    },
    {
      title: 'Flyaway hair on a busy street',
      change: 'The hardest kind of cut-out: backlit hair against a city street. The street and the passers-by are gone; the fine strands stay as soft see-through edges.',
      before: caseImage('white-hair-before', 'Real phone photo: a model in a camel coat on a city street at golden hour, backlit hair blowing, a light stand and a scooter behind her'),
      after: caseImage('white-hair-after', 'Real example: the same model cut out on a transparent background, every flyaway strand of hair kept'),
      transparent: true,
    },
  ],
}

// Block ③: a catalogue on white, a studio's per-image packshot rate against a batch upload.
function catalogBills({ products }: OfferFacts): CostBills {
  const plan = product('pro_monthly', products)
  const price = plan ? usd(plan.priceUsd) : 'Monthly plans unavailable'
  return {
    heading: 'Bulk Background Removal for Product Catalogs',
    intro: `${CATALOG_PRODUCTS} products on white for a store catalogue. The same job, two bills.`,
    photographer: {
      title: 'A studio packshot quote',
      total: { amount: usdRange({ low: packshotUsd.low * CATALOG_PRODUCTS, high: packshotUsd.high * CATALOG_PRODUCTS }), when: 'delivered in days' },
      lines: [
        { label: `${CATALOG_PRODUCTS} white-background packshots, ${usdRange(packshotUsd)} each`, value: usdRange({ low: packshotUsd.low * CATALOG_PRODUCTS, high: packshotUsd.high * CATALOG_PRODUCTS }) },
        { label: 'Send the products, wait for the shoot', value: 'days' },
      ],
      fine: `Per-image rates for plain-white packshots published in 2026 for the US: ${usdRange(packshotUsd)} (studio price lists). Your quotes will vary.`,
    },
    site: {
      title: brand,
      total: { prefix: plan ? 'from' : '', amount: price, suffix: plan ? '/month' : '', when: `about ${photoSeconds} seconds a photo` },
      lines: [
        { label: plan ? `Pro plan, ${plan.credits.toLocaleString('en-US')} credits a month` : 'Pro plan', value: price },
        { label: 'Photos per upload', value: `Pro up to ${pro.batchMax}, Max up to ${max.batchMax}` },
        { label: 'Each result', value: 'Transparent PNG or white background' },
      ],
      fine: `Upload a folder of phone photos at once on Pro (${pro.batchMax}) or Max (${max.batchMax}); every product comes back cut out, no watermark, private and cleared for commercial use.`,
    },
  }
}

const copy = {
  slug: 'transparent-background',
  keyword: 'transparent png maker',
  label: 'Transparent PNG maker',
  module: 'image',
  title: 'Transparent PNG Maker — Remove Background or Make It White',
  description: `Cut the product out of a phone photo and download a transparent PNG or a pure white version for Amazon, Etsy and Shopify. No prompts, no manual masking.`,
  h1: 'Transparent PNG Maker: Remove the Background or Make It White',
  subtitle: 'From a phone photo to a clean cut-out, for any background or a pure white main image.',
  answerBlock: `Transparent PNG maker tools cut the subject out of a photo and drop the background. ${brand} does it from one phone photo: pick Studio Product Shot, and the product comes back on a transparent background, ready to place on white or on any store background. No prompts, no manual masking, about ${photoSeconds} seconds a photo.`,
  hero: {
    before: withFirstFrame(dressPhone),
    after: dressWhite,
    caption: 'Your phone photo → a pure white main image: the same dress, every embroidered flower kept',
    cta: { label: 'Upload photo', href: '/generate' },
  },
  facts: [
    {
      label: `Amazon: Pure White, ${px(amazon.zoomPx)} px for Zoom`,
      value: `Amazon wants the main image on pure white (RGB 255, 255, 255) and ${px(amazon.minPx)} to ${px(amazon.maxPx)} px on the longest side; over ${px(amazon.zoomPx)} px lets shoppers zoom. ${brand}'s white-background version is pure white.`,
    },
    {
      label: `Etsy and Shopify: ${px(etsy.minPx)} px and Up`,
      value: `Etsy asks for photos at least ${px(etsy.minPx)} px wide and tall; Shopify says ${px(shopify.squarePx)} × ${px(shopify.squarePx)} px usually displays best for square images. ${brand} exports ${tierPixels} on the long side.`,
    },
    {
      label: 'Transparent PNG or Pure White, From One Photo',
      value: `${brand} exports every cut-out as a PNG with a transparent background, in ${sizeCountWord} sizes; the white-background version is the same cut-out on pure white. Upload ${uploadLimits}.`,
    },
  ],
  headings: {
    facts: 'White Background Photo Editor for Online Stores',
    faq: 'Transparent PNG Maker FAQ',
    related: `More From ${brand}`,
  },
  landing: {
    factsNote: `From the platforms' own help pages (Amazon, Etsy, Shopify), checked ${PLATFORM_SPECS_CHECKED.en}. Platforms change their rules; check before you list.`,
    edits: cutOuts,
    templates: {
      heading: 'White Background for Product Photos',
      intro: 'Start with Studio Product Shot for a cut-out; the other product templates put the same product in a styled scene.',
      categoryKeys: [CATEGORY.products],
      defaultId: CUT_OUT_TEMPLATE,
    },
    compare: {
      heading: 'Transparent PNG vs White Background vs Listing Photo',
      intro: 'Three ways to show a product alone. Pick by where the picture is going.',
      table: {
        caption: 'What each one is and when to use it',
        headers: ['', 'What you upload', 'What you get', 'Use it for'],
        rows: [
          ['Transparent PNG', 'A phone photo of the product', 'The product cut out, no background, soft edges kept', 'Placing on your own colours, banners, ads and site layouts'],
          ['White background', 'The same phone photo', 'The same cut-out on pure white', 'Marketplace main images: Amazon, Etsy, Shopify'],
          ['Listing photo', 'The same phone photo', 'The product in a styled scene with light and props', 'Secondary images, social posts and ads that need a setting'],
        ],
      },
    },
  },
} as const

export const makeTransparentBackground = (offers: OfferFacts) => defineContentPage({
  ...copy,
  costBills: catalogBills(offers),
  faq: [
    {
      question: 'How do I make a transparent PNG from a photo?',
      answer: `Upload the photo to ${brand}, pick Studio Product Shot and generate. The product comes back cut out on a transparent background in about ${photoSeconds} seconds; download it as a transparent PNG or as a white-background version.`,
    },
    {
      question: 'Can I change the background to white instead of transparent?',
      answer: `${brand} gives every cut-out both ways: the transparent PNG, and the same cut-out on pure white for marketplace main images. One generation, two downloads.`,
    },
    {
      question: 'Can I use the transparent PNG commercially?',
      answer: `Photos made with paid ${brand} credits are private, have no watermark and can be used commercially, and Pro and Max plans upload in batches. The ${site.billing.freeCredits} free credits new users get once make photos that are public, carry a watermark and are for personal, non-commercial use. ${plansSentence(offers)}`,
    },
    {
      question: 'What sizes does the PNG come in?',
      answer: `${brand} exports ${tierPixels} on the long side, in ${sizeCountWord} aspect ratios from a square listing to a 9:16 story. For Amazon zoom, anything over ${px(amazon.zoomPx)} px works.`,
    },
    {
      question: 'Does it keep fine detail like hair and fabric edges?',
      answer: `${brand} keeps the product's shape, colours, label and texture, and soft edges such as hair or fur come through as see-through strands rather than a hard outline. Check each cut-out before you list it: very busy or low-light photos are the hardest.`,
      link: { href: '/commercial-photography', anchor: 'See more commercial photography examples.' },
    },
  ],
  related: [
    { href: '/', anchor: 'AI image to image', note: 'The studio: templates for food, products, rooms, pets and art styles.' },
    { href: '/commercial-photography', anchor: 'Commercial photography', note: 'For shops and sellers who need styled product shots and listings, not only a cut-out.' },
    { href: '/image-to-image-generator', anchor: 'Image to image generator', note: 'For anyone who wants to see how image to image works on a photo.' },
    pricingRelated(offers),
  ],
})

export const transparentBackground = makeTransparentBackground(baselineOffers)
