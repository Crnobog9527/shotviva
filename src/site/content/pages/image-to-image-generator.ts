import { defineContentPage } from '@/core/content'

import { site } from '../../site.config'
import { freeImagesLabel, fromCredits, plansSentence, tierPixels, uploadLimits } from '../offer'
import { placeholderHero, sharedCostTable, sharedFacts } from '../shared'

// Final copy (T11). Owns "image to image generator" so the home page never targets it
// (建站规格 R1). No audience in the Title / H1: this is a general tool page (G2, §4).
const brand = site.brand.name

export const imageToImageGenerator = defineContentPage({
  slug: 'image-to-image-generator',
  keyword: 'image to image generator',
  label: 'Image to image generator',
  module: 'image',
  title: 'Image to Image Generator: Templates, No Prompts (2026)',
  description: `Image to image generator with templates for food, products, rooms, pets and art styles. Upload a photo, no prompts. ${freeImagesLabel}.`,
  h1: 'Image to Image Generator With Ready-Made Templates',
  subtitle: 'Start from your own photo, not a blank text box. The subject stays as shot.',
  answerBlock: `Image to image generator tools make a new picture from a photo you upload. The ${brand} generator works with templates: pick one for food, products, beauty, rooms, pets or an art style, and it sets the light, the scene or the style for you. The subject stays as shot, and new users get ${freeImagesLabel}.`,
  hero: placeholderHero('The generator kept the dish and the plate and changed only the scene.'),
  facts: sharedFacts(),
  costTable: sharedCostTable(),
  faq: [
    {
      question: 'What is an image to image generator?',
      answer:
        'It is a tool that takes a photo you already have and makes a new version of it, instead of starting from a text description. You keep the real subject and get a new look.',
    },
    {
      question: 'Do I need to write a prompt?',
      answer: `No. You pick a template and ${brand} handles the rest. Some templates ask for a short line of text, such as a headline and a price for a poster.`,
    },
    {
      question: 'Will the generator change my product, dish or room?',
      answer:
        'Templates are built to keep the subject as shot: the shape, the colors, the label, the plating or the room layout. They change the light, the background, the scene or the art style.',
    },
    {
      question: 'What photos work best?',
      answer: `A sharp phone photo with the whole subject in the frame and even light. You can upload ${uploadLimits}. Output sizes are ${tierPixels}.`,
    },
    {
      question: 'How much does the image to image generator cost?',
      answer: `New users get ${freeImagesLabel}. After that a photo costs ${fromCredits}. ${plansSentence()}`,
    },
  ],
  related: [
    { href: '/', anchor: 'AI image to image', note: 'All templates, grouped by food, products, beauty, rooms, pets and art styles.' },
    { href: '/pricing', anchor: 'Pricing', note: 'Monthly plans, yearly plans and one-time credit packs.' },
  ],
  headings: {
    facts: 'Image to Image Generator Facts',
    costTable: `Image to Image Generator vs a Photographer`,
    faq: 'Image to Image Generator FAQ',
  },
})
