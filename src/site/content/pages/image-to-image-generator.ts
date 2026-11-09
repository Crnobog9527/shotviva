import { defineContentPage } from '@/core/content'

import { site } from '../../site.config'
import { productBills } from '../home'
import { pairImage, sizeCountWord } from '../landing-shared'
import { pricingRelated } from '../shared'
import { freeImagesLabel, FreeImagesLabel, fromCredits, photoSeconds, plansSentence, SET_PHOTOS, tierList, tierPixels, uploadLimits } from '../offer'

// Final SEO copy (T11): Title, H1, answer and FAQ own "image to image generator" so the home
// page never targets it (建站规格 R1). Layout and the facts / bills / links blocks follow the
// v3-b landing comp (T44). No audience in the Title / H1: a general tool page (G2, §4).
const brand = site.brand.name

export const imageToImageGenerator = defineContentPage({
  slug: 'image-to-image-generator',
  keyword: 'image to image generator',
  label: 'Image to image generator',
  module: 'image',
  title: `Image to Image Generator: No Prompts (2026) | ${brand}`,
  description: `Image to image generator with templates for food, products, rooms, pets and art styles. Upload a photo, no prompts. ${FreeImagesLabel}.`,
  h1: 'Image to Image Generator With Ready-Made Templates',
  subtitle: 'Start from your own photo, not a blank text box. The subject stays as shot.',
  answerBlock: `Image to image generator tools make a new picture from a photo you upload. The ${brand} generator works with templates: pick one for food, products, beauty, rooms, pets or an art style, and it sets the light, the scene or the style for you. The subject stays as shot, and new users get ${freeImagesLabel}.`,
  hero: {
    before: pairImage('example-skincare-before', 'Phone photo of a skincare jar on a bathroom shelf, flat indoor light (illustrative example)'),
    after: pairImage('example-skincare-after', 'The same skincare jar on a stone podium in soft spa light, Spa Podium template (illustrative example)'),
    caption: 'Your phone photo → Spa Podium template: same jar, a new set and light · Illustrative example',
    cta: { label: 'Upload photo', href: '/generate' },
  },
  facts: [
    { label: `One Photo: ${uploadLimits}`, value: 'A phone photo is enough. No cut-out, no white background, no editing first.' },
    {
      label: 'A Template Instead of a Description',
      value: 'Each template carries the light, the scene or the art style. One optional line, "Anything to change?", takes a short note.',
    },
    {
      label: `${tierList}, as PNG`,
      value: `${tierPixels} on the long side, in ${sizeCountWord} sizes from a square listing to a 9:16 story. About ${photoSeconds} seconds a photo, ${fromCredits}.`,
    },
  ],
  costBills: productBills(
    `What ${SET_PHOTOS} Product Photos Cost: Photographer vs Image to Image`,
    `One product, ${SET_PHOTOS} styled photos, retouched and ready to post. The same job, two bills.`,
  ),
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
      answer: `New users get ${freeImagesLabel}. ${plansSentence()}`,
    },
  ],
  related: [
    { href: '/', anchor: 'AI image to image', note: 'The studio: templates for food, products, rooms, pets and art styles.' },
    { href: '/commercial-photography', anchor: 'Commercial product photography', note: 'For shops and sellers who need studio product shots without a photographer.' },
    { href: '/ai-restaurant-menu', anchor: 'AI restaurant menu photos', note: 'For restaurants that need menu and delivery-app photos from a phone shot.' },
    pricingRelated(),
  ],
  headings: {
    facts: 'What an Image to Image Generator Needs From You',
    faq: 'Image to Image Generator FAQ',
    related: `More From ${brand}`,
  },
  landing: {
    factsNote: `These are ${brand}'s own limits and sizes, the same on every page of this site.`,
  },
})
