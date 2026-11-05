import { freeImagesLabel } from '@/core/config'
import { defineContentPage } from '@/core/content'

import { site } from '../../site.config'
import { placeholderHero, sharedCostTable, sharedFacts } from '../shared'

// Placeholder copy; final copy is T11. Keeps "image to image generator" off the home page (建站规格 R1).
export const imageToImageGenerator = defineContentPage({
  slug: 'image-to-image-generator',
  keyword: 'image to image generator',
  label: 'Image to image generator',
  module: 'image',
  title: 'Image to Image Generator for Restaurants (2026)',
  description: `Upload one photo, choose a template and get a studio-style image with the subject unchanged. ${freeImagesLabel(site)}, no prompts.`,
  h1: 'Image to image generator for restaurant photos',
  answerBlock: `Image to image generator by ${site.brand.name}: upload one photo, choose a template and get a new studio-style image while the subject stays unchanged. It is built for restaurant dishes and small-business products. There are no prompts to write and no design skills needed. Start with ${freeImagesLabel(site)}, then buy a one-time pass or pack.`,
  hero: placeholderHero('The dish is untouched; the generator only changed the scene.'),
  facts: sharedFacts(),
  costTable: sharedCostTable(),
  faq: [
    {
      question: 'What is an image to image generator?',
      answer: 'It takes a photo you already have and creates a new image from it, instead of starting from text.',
    },
    {
      question: 'Will the generator change my dish?',
      answer: 'No. Templates are tuned to keep the food, tableware and plating as they are.',
    },
    {
      question: 'Do I need to write a prompt?',
      answer: 'No. You pick a template and optionally add text such as a dish name.',
    },
  ],
  related: [
    { href: '/', anchor: 'AI image to image' },
    { href: '/pricing', anchor: 'Pricing' },
  ],
})
