import type { HomePage, ImageRef } from '@/core/content'

import { caseImage, dishImage, homeImage } from './landing-shared'
import { OUTPUT_TIERS, tierList, uploadLimits } from './offer'

// The home page's how-to blocks, each point led by a picture (Owner 2026-11-12): the steps and
// the use cases. The words name the point in a line; the picture shows it.

// The tote set (design/assets/img/hero-set-*.webp, ARCHITECTURE §13 item 2): one real phone
// photo and three results from it (Owner 2026-11-21: every example's before is a real phone photo), shared with the hero and the shoot demo.
export const tote = {
  phone: homeImage('hero-set-phone', 'Real phone photo: a woven leather tote on a busy kitchen counter, window light'),
  listing: homeImage('hero-set-listing', 'The same woven leather tote as a white-background listing photo, soft studio light (real example)'),
  lifestyle: homeImage('hero-set-lifestyle', 'The same tote on a café chair by a window, warm morning light (real example)'),
  promo: homeImage('hero-set-promo', 'The same tote on a promo poster headed New Season Tote, bright studio light (real example)'),
} as const satisfies Record<string, ImageRef>

// The steps' pictures (Owner 2026-11-24): a dish shot on the kitchen counter and three food
// templates, the first of them the one picked.
const dish = {
  phone: dishImage('food-1-photo', 'Real phone photo: spaghetti carbonara on a white plate on a steel kitchen counter'),
  slate: dishImage('food-1-ai', 'Real example: the same carbonara on a slate table in dappled sunlight'),
  dark: dishImage('food-2-ai', 'Real example: spaghetti bolognese on a dark table', true),
  board: dishImage('food-3-ai', 'Real example: a steak plate on a rustic wooden board', true),
}

const [standard, hd, max] = OUTPUT_TIERS
const phoneTag = 'Real phone photo'

export const steps = {
  heading: 'How Image to Image AI Works in 3 Steps',
  items: [
    {
      heading: 'Upload One Photo',
      text: `A phone photo is enough: ${uploadLimits}. Keep the whole subject in the frame.`,
      visual: { kind: 'upload', image: dish.phone, file: 'IMG_3108.jpg' },
    },
    {
      heading: 'Pick a Template',
      text: 'Food, products, beauty, rooms, pets or an art style. The template sets the look, so there is nothing to write.',
      visual: {
        kind: 'picker',
        tiles: [
          { image: dish.slate, name: 'Dappled Slate' },
          { image: dish.dark, name: 'Dark Flat Lay' },
          { image: dish.board, name: 'Rustic Board' },
        ],
        picked: 0,
        caption: 'The Dappled Slate template picked from the template list',
      },
    },
    {
      heading: `Download in ${tierList}`,
      text: `${standard.name} for ${standard.use}, ${hd.name} for ${hd.use}, ${max.name} for ${max.use}.`,
      visual: {
        kind: 'sizes',
        image: { ...dish.slate, alt: `The carbonara photo at its three export sizes: ${standard.px}, ${hd.px} and ${max.px} px` },
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
        before: caseImage('menu-steak-phone', 'Real phone photo: sliced sirloin steak with fries and asparagus on a white plate on a steel kitchen pass, plate stacks and squeeze bottles behind'),
        after: caseImage('menu-steak-board', 'Real example: the same sliced sirloin, fries and asparagus on the same white plate on a dark wooden board, warm side light, herbs and a fork beside it'),
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
        before: caseImage('bag-phone', 'Real phone photo: a woven tan leather tote with a gold chain on a marble kitchen counter, keys, a mug and a parcel beside it'),
        after: caseImage('bag-listing', 'Real example: the same tote face-on on a pure white background, soft studio light, a marketplace main image'),
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
