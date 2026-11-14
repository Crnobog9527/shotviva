import type { HomePage, ImageRef } from '@/core/content'

import { caseImage, homeImage } from './landing-shared'
import { OUTPUT_TIERS, tierList, uploadLimits } from './offer'

// The home page's how-to blocks, each point led by a picture (Owner 2026-11-12): the steps and
// the use cases. The words name the point in a line; the picture shows it.

// The illustrative tote set (design/assets/img/hero-set-*.webp, ARCHITECTURE §13 item 2): one
// phone snapshot and three results from it, shared with the hero and the shoot demo.
export const tote = {
  phone: homeImage('hero-set-phone', 'Phone snapshot of a woven leather tote on a busy kitchen counter, window light (real example)'),
  listing: homeImage('hero-set-listing', 'The same woven leather tote as a white-background listing photo, soft studio light (real example)'),
  lifestyle: homeImage('hero-set-lifestyle', 'The same tote on a café chair by a window, warm morning light (real example)'),
  promo: homeImage('hero-set-promo', 'The same tote on a promo poster headed New Season Tote, bright studio light (real example)'),
} as const satisfies Record<string, ImageRef>

const [standard, hd, max] = OUTPUT_TIERS
const phoneTag = 'Phone photo'

export const steps = {
  heading: 'How Image to Image AI Works in 3 Steps',
  items: [
    {
      heading: 'Upload One Photo',
      text: `A phone photo is enough: ${uploadLimits}. Keep the whole subject in the frame.`,
      visual: { kind: 'upload', image: tote.phone, file: 'IMG_2047.jpg' },
    },
    {
      heading: 'Pick a Template',
      text: 'Food, products, beauty, rooms, pets or an art style. The template sets the look, so there is nothing to write.',
      visual: {
        kind: 'picker',
        tiles: [
          { image: tote.listing, name: 'White Background' },
          { image: tote.lifestyle, name: 'Lifestyle Table' },
          { image: tote.promo, name: 'Promo Poster' },
        ],
        picked: 1,
        caption: 'The Lifestyle Table template picked from the template list',
      },
    },
    {
      heading: `Download in ${tierList}`,
      text: `${standard.name} for ${standard.use}, ${hd.name} for ${hd.use}, ${max.name} for ${max.use}.`,
      visual: {
        kind: 'sizes',
        image: { ...tote.lifestyle, alt: `The tote lifestyle photo at its three export sizes: ${standard.px}, ${hd.px} and ${max.px} px` },
        tiers: [standard, hd, max],
      },
    },
  ],
} as const satisfies HomePage['steps']

// 「What People Use Image to Image AI For」 (SEO launch handbook G5): one card per landing page,
// led by that page's own phone photo and result, closing with an in-body link whose anchor is
// the page's keyword. The pictures and their alt text are the landing pages' own.
export const useCases = {
  id: 'use-cases',
  heading: 'What People Use Image to Image AI For',
  cards: [
    {
      heading: 'AI Restaurant Menu Photos',
      text: 'Shoot a dish on the pass with a phone. The food stays as served; the plate, the light and the background can change. Start with',
      link: { href: '/ai-restaurant-menu', anchor: 'AI restaurant menu photos' },
      after: '.',
      visual: {
        kind: 'pair',
        before: caseImage('menu-fish-phone', 'Real phone photo: pickled mustard fish in a white enamel bowl on a steel kitchen pass, harsh green-tinted overhead light'),
        after: caseImage('menu-fish-dark', 'Real example: the same pickled mustard fish re-plated in a white porcelain bowl on dark rough timber, warm side light and rising steam'),
        tags: { before: phoneTag, after: 'Menu photo' },
      },
    },
    {
      heading: 'Commercial Photography Without a Studio',
      text: 'One phone photo of a product becomes a white-background listing, a lifestyle scene or a promo poster. See what replaces a shoot in',
      link: { href: '/commercial-photography', anchor: 'commercial photography' },
      after: '.',
      visual: {
        kind: 'pair',
        before: caseImage('sneaker-phone', 'Real phone photo: an off-white leather sneaker with a sage-green heel tab on a hallway floor, hard morning sun, keys and an open shoe box in frame'),
        after: caseImage('sneaker-listing', 'Real example: the same sneaker on a pure white background, soft studio light, a marketplace main image'),
        tags: { before: phoneTag, after: 'Listing' },
      },
    },
    {
      heading: 'Image to Image Generator With Templates',
      text: 'Pick a template instead of writing a prompt: food, products, beauty, pets or an art style. Try the',
      link: { href: '/image-to-image-generator', anchor: 'image to image generator' },
      after: '.',
      visual: {
        kind: 'pair',
        before: caseImage('pet-phone', 'Real phone photo: a tabby-and-white cat lying on the arm of a grey sofa in evening lamp light, a blanket and a TV remote beside it'),
        after: caseImage('pet-watercolor', 'Real example: the same cat as a hand-painted watercolour storybook illustration, soft washes on textured paper'),
        tags: { before: phoneTag, after: 'Watercolor' },
      },
    },
    // The fourth landing page (SEO launch handbook 04-P1): two by two on wide screens.
    {
      heading: 'Transparent PNG and White Background',
      text: 'Cut a product out of a phone photo and download it on a transparent background or on pure white, ready for any marketplace. Try the',
      link: { href: '/transparent-background', anchor: 'transparent PNG maker' },
      after: '.',
      visual: {
        kind: 'pair',
        before: caseImage('white-dress-before', 'Real phone photo: an ivory tiered maxi dress with folk flower embroidery hanging on a bedroom door, a bed and a laundry basket in frame'),
        after: caseImage('white-dress-after', 'Real example: the same embroidered dress on a pure white background'),
        tags: { before: phoneTag, after: 'White' },
      },
    },
  ],
} as const satisfies HomePage['topics']
