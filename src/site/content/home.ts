import { freeImagesLabel } from '@/core/config'
import { defineHomePage } from '@/core/content'

import { site } from '../site.config'
import { featuredTemplates } from './featured-templates'
import { placeholderHero, sharedCostTable, sharedFacts } from './shared'

// Placeholder copy; final copy is T11.
export const homePage = defineHomePage({
  slug: '',
  keyword: 'image to image ai',
  label: 'AI image to image',
  title: 'Image to Image AI for Studio Food Photos (2026)',
  description: `Turn phone photos of your dishes into studio food photos. Upload, pick a template, add text. ${freeImagesLabel(site)} to start.`,
  h1: 'Image to image AI for studio-quality food photos',
  answerBlock: `Image to image AI from ${site.brand.name} turns a phone photo of your dish into a studio-quality food photo. Upload a photo, pick a template and add your text, with no prompts and no photographer. The plate, garnish and plating stay exactly as you served them. Start with ${freeImagesLabel(site)}.`,
  hero: placeholderHero('Same dish, same plate: only the light and background changed.'),
  templateGrid: { heading: 'Featured templates', templates: featuredTemplates },
  facts: sharedFacts(),
  costTable: sharedCostTable(),
  faq: [
    {
      question:
        'How can I make my restaurant food photos look professional without hiring a photographer?',
      answer: `Take a photo with your phone, upload it to ${site.brand.name}, pick a template and get a studio-style version of the same dish.`,
    },
    {
      question: 'Is there an AI that turns phone photos into studio product photos?',
      answer: `Yes. ${site.brand.name} keeps your dish and plating unchanged and only replaces light and background.`,
    },
    {
      question: 'How much does it cost?',
      answer: `You start with ${freeImagesLabel(site)}. After that you buy a one-time pass or pack; there is no subscription.`,
    },
  ],
  related: [
    { href: '/image-to-image-generator', anchor: 'Image to image generator' },
    { href: '/pricing', anchor: 'Pricing' },
  ],
})
