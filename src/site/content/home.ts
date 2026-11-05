import { defineHomePage, type HeadedText } from '@/core/content'

import { site } from '../site.config'
import { templateCategories } from './featured-templates'
import {
  fromCredits,
  freeImagesLabel,
  freeStandardImages,
  photographerRate,
  planFrom,
  plansSentence,
  tierList,
  uploadLimits,
  usd,
  yearlySaving,
  OUTPUT_TIERS,
} from './offer'
import { placeholderHero, sharedCostTable, sharedFacts } from './shared'

// Final home copy (T11). TDK, H1, subtitle, direct answer and the six H2s are fixed by
// 建站规格 §4 and G1; FAQ by G6. Numbers come from offer.ts / site.config (G3).
const brand = site.brand.name
const [standard, hd, max] = OUTPUT_TIERS

function plansText(): HeadedText {
  const heading = planFrom ? `Plans From ${usd(planFrom.priceUsd)} a Month` : 'Plans and Credit Packs'
  const yearly = yearlySaving ? ` Yearly plans save ${yearlySaving}% or more.` : ''
  return {
    heading,
    text: `${plansSentence()}${yearly} Paid credits never expire, and every photo you make with them is private and watermark-free. Here is how that compares with a photographer or doing it yourself.`,
  }
}

export const homePage = defineHomePage({
  slug: '',
  keyword: 'image to image ai',
  label: 'AI image to image',
  title: 'Image to Image AI: Restyle a Photo, Keep the Subject (2026)',
  description: `Image to image AI that turns a phone photo into a studio shot or a new art style. Pick a template, no prompts, the subject stays as shot. ${freeStandardImages} free images.`,
  h1: 'Image to Image AI: Restyle a Photo, Keep the Subject',
  subtitle:
    'The AI photo studio that starts from your real photo. What you shot stays; the template changes the light, the scene or the art style.',
  answerBlock: `Image to image AI takes a photo you already have and gives it a new look while the subject stays as shot. With ${brand} you upload one phone photo, pick a template for food, products, rooms, pets or an art style, and download it in ${tierList}. No prompts to write. New users get ${freeImagesLabel}.`,
  hero: placeholderHero('Same photo, same subject: the template changed only the light and the background.'),
  demoNote: `One phone photo can become a full set: a white-background listing photo, a lifestyle scene and a promo poster, each with the same product. Hiring a photographer for a set like this often costs ${photographerRate}.`,
  steps: {
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
        text: `${standard.name} is ${standard.px} px for ${standard.use}, ${hd.name} is ${hd.px} px for ${hd.use}, and ${max.name} is ${max.px} px for ${max.use}. A ${standard.name} photo costs ${fromCredits}.`,
      },
    ],
  },
  templateGrid: {
    heading: 'Img to Img Templates: No Prompts to Write',
    intro: `Every template starts from your phone photo and ends with a finished picture. Pick one and ${brand} does the rest. Templates cost ${fromCredits} a photo.`,
    categories: templateCategories,
  },
  facts: sharedFacts(),
  factsIntro: `Many AI image to image tools redraw the whole picture. ${brand} templates are built to keep what you shot, the product, the dish, the room or the pet, and change only the look around it. These facts are the same on every page of this site.`,
  freeOffer: {
    heading: 'Free Image to Image AI: What You Get',
    points: [
      {
        heading: `${freeStandardImages} Free ${standard.name} Images When You Sign Up`,
        text: `Every new account gets ${site.billing.freeCredits} free credits, once. That covers ${freeImagesLabel} on most templates. They do not refill every day or every month.`,
      },
      {
        heading: 'Free Photos Are Public and Watermarked, Paid Photos Are Private',
        text: `A photo made with free credits is public and carries a small "Made with ${brand}" watermark. A photo made with paid credits is private, has no watermark and is yours to use commercially. Buying a plan later does not change photos you already made.`,
      },
    ],
    plans: plansText(),
  },
  costTable: sharedCostTable(),
  faq: [
    {
      question: 'What is image to image AI?',
      answer: `Image to image AI makes a new picture from a photo you already have, instead of from a text description. On ${brand} you upload a photo, pick a template and get the same subject with new light, a new scene or a new art style.`,
    },
    {
      question: 'Is image to image AI free?',
      answer: `You can start free. New users get ${freeImagesLabel}. After that a photo costs ${fromCredits}. ${plansSentence()} Free photos are public and carry a watermark.`,
    },
    {
      question: "Does image to image AI keep my photo's subject the same?",
      answer: `Many tools redraw the subject. ${brand} templates are built to keep it as shot, such as the product label, the plating or the room layout, and change only the light, the background, the scene or the style.`,
    },
    {
      question: 'How is image to image AI different from an AI image generator?',
      answer:
        'An AI image generator starts from a text prompt and invents the whole picture. Image to image AI starts from your photo, so the subject is real and you do not have to describe it.',
      link: { href: '/image-to-image-generator', anchor: 'See how our image to image generator works.' },
    },
    {
      question: 'Can I use the photos commercially?',
      answer: `Yes, photos made with paid credits. They are private, have no watermark, and you can use them in your store, menu, listing or ads. Photos made with the free credits are public and carry a watermark.`,
    },
  ],
  related: [
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
    facts: 'AI Image to Image: What Stays the Same',
    costTable: `Hiring a Photographer vs ${brand}`,
    faq: 'Image to Image AI FAQ',
    related: 'Image to Image AI for Food, Products, Rooms and More',
  },
})
