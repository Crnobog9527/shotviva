import { defineHomePage, type CostBills, type HeadedText, type HomePage, type ImageRef, type ShootDemo } from '@/core/content'

import { site } from '../site.config'
import {
  hundredCreditsFrom,
  freeImagesLabel,
  FreeImagesShort,
  FreeImagesTitle,
  packshotUsd,
  photoSeconds,
  planFrom,
  plansSentence,
  quoteUsd,
  setShotsUsd,
  SET_PHOTOS,
  styledShotUsd,
  tierList,
  tierPixels,
  uploadLimits,
  usd,
  usdRange,
  yearlySaving,
  OUTPUT_TIERS,
} from './offer'
import { sharedFacts } from './shared'

// Final home copy (T11). TDK, H1, subtitle, direct answer and the six H2s are fixed by
// 建站规格 §4 and G1; the nine FAQ questions and how their answers are written by G6 (T35):
// every answer names Shotviva or image to image AI in its first sentence. Numbers come from
// offer.ts / site.config (G3).
const brand = site.brand.name
const [standard, hd, max] = OUTPUT_TIERS

function plansText(): HeadedText {
  const heading = planFrom ? `Plans From ${usd(planFrom.priceUsd)} a Month` : 'Plans and Credit Packs'
  const yearly = yearlySaving ? ` Yearly plans save up to ${yearlySaving}%.` : ''
  return {
    heading,
    text: `${plansSentence()}${yearly} Paid credits never expire, and every photo you make with them is private and watermark-free. Here is how that compares with a photographer or doing it yourself.`,
  }
}

// The illustrative tote set (design/assets/img/hero-set-*.webp, ARCHITECTURE §13 item 2): one
// phone snapshot and three results from it. All 1080×1350.
const photo = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 1080, height: 1350 })
const phoneShot = photo('hero-set-phone', 'Phone snapshot of a woven leather tote on a busy kitchen counter, window light (illustrative example)')
const listingShot = photo('hero-set-listing', 'The same woven leather tote as a white-background listing photo, soft studio light (illustrative example)')

// Also the /commercial-photography demo (T44).
export const shoot: ShootDemo = {
  heading: { lead: 'One phone photo → ', emphasis: 'a full shoot' },
  intro: 'Shot on a phone on a kitchen counter. Three deliverables, and the same tote in every one: the weave, the stitching, the chain.',
  phone: { image: phoneShot, file: 'IMG_2047.jpg', caption: 'As shot on a phone. Window light, a busy counter, keys and a mug in frame.' },
  arrow: 'Three templates, same tote',
  results: [
    { image: listingShot, title: 'Marketplace listing', template: 'White Background template' },
    {
      image: photo('hero-set-lifestyle', 'The same tote on a café chair by a window, warm morning light (illustrative example)'),
      title: 'Lifestyle scene',
      template: 'Lifestyle Table',
    },
    {
      image: photo('hero-set-promo', 'The same tote on a promo poster headed New Season Tote, bright studio light (illustrative example)'),
      title: 'Promo poster',
      template: 'Promo Poster',
    },
  ],
  bill: {
    photographer: { who: 'Photographer', amount: 'A full shoot', note: 'Booking, studio, styling and retouching' },
    site: { who: brand, amount: 'No reshoot needed', note: 'One phone photo for a listing image, a lifestyle shot and a promo poster' },
    line: 'Choose a different template to use the same photo in a new setting.',
  },
}

// Two bills for the same job (DESIGN §6.9 item 6): every figure from site.config via offer.ts.
// The landing pages reuse it with their own heading and intro; `moreFine` adds a source.
export function productBills(heading: string, intro: string, moreFine = ''): CostBills {
  const plan = planFrom ? usd(planFrom.priceUsd) : ''
  return {
    heading,
    intro,
    photographer: {
      title: "A photographer's quote",
      total: { amount: usdRange(quoteUsd), when: 'delivered in days' },
      lines: [
        { label: `${SET_PHOTOS} styled shots, ${usdRange(styledShotUsd)} each`, value: usdRange(setShotsUsd) },
        { label: 'Booking, shoot, edits', value: 'days' },
      ],
      fine: `Per-image rates published in 2026 for the US: styled product photos ${usdRange(styledShotUsd)} (Shopify, Jan 2026); plain-white packshots ${usdRange(packshotUsd)} (studio price lists)${moreFine}. Many studios add booking or setup fees. Your quotes will vary.`,
    },
    site: {
      title: brand,
      total: { prefix: 'from', amount: plan, suffix: '/month', when: `about ${photoSeconds} seconds a photo` },
      lines: [
        { label: `Starter plan, ${planFrom?.credits ?? ''} credits a month`, value: plan },
        { label: 'Start with', value: 'Your existing phone photo' },
        { label: 'Make', value: 'A listing image, a lifestyle shot and a promo poster' },
      ],
      fine: `Styling and retouching are in the template, and your subject stays as you shot it. Start with ${freeImagesLabel}, no card needed.`,
    },
  }
}

const steps = {
  heading: 'How Image to Image AI Works in 3 Steps',
  items: [
    {
      heading: 'Upload One Photo',
      text: `Take a photo with your phone or choose one from your gallery: ${uploadLimits}. Keep the whole subject in the frame.`,
    },
    {
      heading: 'Pick a Template',
      text: 'Choose a template for food, products, beauty, rooms, pets or an art style. The template sets the light, the scene or the style, so there is nothing to write.',
    },
    {
      heading: `Download in ${tierList}`,
      text: `${standard.name} is ${standard.px} px for ${standard.use}, ${hd.name} is ${hd.px} px for ${hd.use}, and ${max.name} is ${max.px} px for ${max.use}.`,
    },
  ],
} as const satisfies HomePage['steps']

// "3 steps" in FAQ A is the length of the steps block, never typed.
const STEP_COUNT = steps.items.length

export const homePage = defineHomePage({
  slug: '',
  keyword: 'image to image ai',
  label: 'AI image to image',
  title: 'Image to Image AI: Restyle a Photo, Keep the Subject (2026)',
  description: `Image to image AI turns a phone photo into a studio shot or a new art style. Pick a template, no prompts, the subject stays as shot. ${FreeImagesShort}.`,
  h1: 'Image to Image AI: Restyle a Photo, Keep the Subject',
  subtitle:
    'The AI photo studio that starts from your real photo. What you shot stays; the template changes the light, the scene or the art style.',
  answerBlock: `Image to image AI takes a photo you already have and gives it a new look while the subject stays as shot. With ${brand} you upload one phone photo, pick a template for food, products, rooms, pets or an art style, and download it in ${tierList}. No prompts. New users get ${freeImagesLabel}.`,
  hero: {
    before: phoneShot,
    after: listingShot,
    caption: 'Your phone photo → White Background template: same tote, only the light and background changed · Illustrative example',
    cta: { label: 'Upload photo', href: '/generate' },
  },
  shoot,
  steps,
  templateGrid: {
    heading: 'Img to Img Templates: No Prompts to Write',
    intro: `Every template starts from your phone photo and ends with a finished picture. Pick one and ${brand} does the rest.`,
    note: 'All template images are illustrative examples.',
  },
  facts: sharedFacts(),
  factsIntro: `Most AI image to image tools hand you a new picture. What you wanted was your picture, only better: the same product, the same dish, the same room, with nicer light and a cleaner scene. That is what ${brand} is built for. The prices and sizes below are the same on every page of this site.`,
  freeOffer: {
    heading: 'Free Image to Image AI: What You Get',
    points: [
      {
        heading: `${FreeImagesTitle} When You Sign Up`,
        text: `Every new account gets ${site.billing.freeCredits} free credits, once. They do not refill every day or every month.`,
      },
      {
        heading: 'Free Photos Are Public and Watermarked, Paid Photos Are Private',
        text: `A photo made with free credits is public and carries a small "Made with ${brand}" watermark. A photo made with paid credits is private, has no watermark and is yours to use commercially. Buying a plan later does not change photos you already made.`,
      },
    ],
    plans: plansText(),
    sample: { src: '/home/example-skincare-after.webp', alt: '', width: 900, height: 1125 },
  },
  costBills: productBills(
    `What ${SET_PHOTOS} Product Photos Cost: Photographer vs ${brand}`,
    `One product, ${SET_PHOTOS} styled photos, retouched and ready to post. The same job, two bills.`,
  ),
  faq: [
    // A: the fixed first sentence names the brand and the keyword together (建站规格 G6).
    {
      question: 'What is image to image AI?',
      answer: `${brand} is an image to image AI tool that gives a photo you already have a new look while the subject stays as shot — in ${STEP_COUNT} steps: upload one phone photo, pick a template, choose ${tierList}. Image to image AI starts from your photo instead of a text description, so the light, the scene or the art style changes and the product, dish, room or pet stays the same.`,
    },
    {
      question: 'Is image to image AI free?',
      answer: `${brand} gives every new user ${freeImagesLabel}, so you can try image to image AI free. ${plansSentence()}${hundredCreditsFrom ? ` The lowest price per 100 credits is about ${hundredCreditsFrom}.` : ''} Free photos are public and carry a watermark.`,
    },
    {
      question: "Does image to image AI keep my photo's subject the same?",
      answer: `${brand} templates are built to keep the subject as you shot it: the product label, the plating, the room layout or the pet. Only the light, the background, the scene or the style changes. Many other image to image AI tools redraw the whole picture, subject included, so check the result before you use it.`,
    },
    {
      question: 'How is image to image AI different from an AI image generator?',
      answer:
        'Image to image AI starts from a photo you took and changes how it looks; an AI image generator starts from a text prompt and invents the whole picture. With image to image AI the subject is real and you never have to describe it.',
      link: { href: '/image-to-image-generator', anchor: 'See how our image to image generator works.' },
      table: {
        caption: 'Image to image AI vs an AI image generator',
        headers: ['', 'Image to image AI', 'AI image generator'],
        rows: [
          ['Starts from', 'A photo you took', 'A text prompt'],
          ['Subject', 'Stays as shot', 'Invented from your words'],
          ['Best for', 'Product, food, room and pet photos you sell or post', 'Ideas, art and scenes that do not exist yet'],
          ['Risk', 'A blurry or badly framed photo limits the result', 'Labels, logos and details can come out wrong'],
        ],
      },
    },
    {
      question: 'Can I use the photos commercially?',
      answer: `${brand} photos made with paid credits are private, carry no watermark and are yours to use commercially: on menus, delivery apps, online store listings and ads. Photos made with the free credits carry a watermark and are not private.`,
    },
    {
      question: 'Do I need to write prompts?',
      answer: `${brand} needs no prompts. You pick a template and fill in any short text it asks for; the template already knows the light, the scene or the style. To adjust a finished photo, say what to change in plain words, such as "make the background pale blue".`,
      link: { href: '/image-to-image-generator', anchor: 'Browse the templates in our image to image generator.' },
    },
    {
      question: 'What sizes and formats can I export?',
      answer: `${brand} exports every photo as a PNG in ${OUTPUT_TIERS.length} sizes: ${tierPixels}. The aspect ratio is set by the template. Photos made with paid credits download at full size with no watermark.`,
    },
    {
      question: `Can I use ${brand} on my phone?`,
      answer: `${brand} works in your phone's browser, Safari on iPhone or Chrome on Android, with no app to install. Take a photo with the camera or choose one from your gallery, then save or share the result.`,
    },
    // I: the brand question, last; it holds no keyword slot (建站规格 G6).
    {
      question: `What is ${brand}?`,
      answer: `${brand} is an AI photo studio on the web that turns one phone photo into a finished picture, with templates for food, products, rooms, pets and art styles. Unlike AI image generators that invent a picture from a prompt, ${brand} starts from your real photo and keeps the subject as shot. New users get ${freeImagesLabel}.`,
    },
  ],
  related: [
    {
      href: '/ai-restaurant-menu',
      anchor: 'AI restaurant menu photos',
      note: 'For restaurants that need menu and delivery-app photos from a phone shot.',
    },
    {
      href: '/commercial-photography',
      anchor: 'Commercial product photography',
      note: 'For shops and sellers who need studio product shots without a photographer.',
    },
    {
      href: '/image-to-image-generator',
      anchor: 'Image to image generator',
      note: 'For anyone who wants to see what the generator does with food, product, room and pet photos.',
    },
    {
      href: '/pricing',
      anchor: 'Pricing',
      note: 'For shops, sellers and hosts comparing monthly plans, yearly plans and one-time credit packs.',
    },
  ],
  headings: {
    facts: `Why Choose ${brand} for AI Image to Image`,
    faq: 'Image to Image AI FAQ',
    related: 'Image to Image AI for Food, Products, Rooms and More',
  },
})
