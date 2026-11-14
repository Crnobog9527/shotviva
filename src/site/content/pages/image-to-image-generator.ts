import { baselineOffers, type OfferFacts } from '../offer'
import { defineContentPage, type EditCases, type ShootDemo } from '@/core/content'

import { site } from '../../site.config'
import { productBills } from '../home'
import { caseImage, sizeCountWord, withFirstFrame } from '../landing-shared'
import { pricingRelated } from '../shared'
import { PLATFORM_SPECS, PLATFORM_SPECS_CHECKED, px } from '../platform-specs'
import { freeImagesLabel, FreeImagesLabel, photoSeconds, plansSentence, SET_PHOTOS, tierList, tierPixels, uploadLimits } from '../offer'

// Final SEO copy (T11): Title, H1, answer and FAQ own "image to image generator" so the home
// page never targets it (建站规格 R1). Layout and the facts / bills / links blocks follow the
// v3-b landing comp (T44). No audience in the Title / H1: a general tool page (G2, §4).
const brand = site.brand.name
const { amazon, shopify } = PLATFORM_SPECS

// The cases on this page (public/cases, Owner 2026-11-11): one cat photo in three art styles,
// then four precise edits of finished pictures. Every brand in them is made up.
const catPhone = caseImage('pet-phone', 'Real phone photo: a tabby-and-white cat lying on the arm of a grey sofa in evening lamp light, a blanket and a TV remote beside it')
const catAnime = caseImage('pet-anime', 'Real example: the same cat, pose and room as a 2D anime illustration with bold outlines and flat cel shading')

const catStyles: ShootDemo = {
  heading: { lead: 'One cat photo → ', emphasis: 'three art styles' },
  intro: 'Shot on a phone on the arm of the sofa. Three styles, and the same cat in every one: the tabby stripes, the white blaze, the green eyes, the pose.',
  phone: { image: catPhone, file: 'IMG_0921.jpg', caption: 'As shot on a phone. Evening lamp light, a blanket and the remote in frame.' },
  arrow: 'Three styles, same cat',
  results: [
    { image: catAnime, title: 'Anime', template: 'Bold lines, flat cel shading' },
    {
      image: caseImage('pet-3d', 'Real example: the same cat as a stylised 3D animated-film character on the sofa, warm cinematic light'),
      title: '3D animation',
      template: 'Rounded forms, cinematic light',
    },
    {
      image: caseImage('pet-watercolor', 'Real example: the same cat as a hand-painted watercolour storybook illustration, soft washes on textured paper'),
      title: 'Watercolour',
      template: 'Paper texture, soft washes',
    },
  ],
}

const edits: EditCases = {
  heading: 'Change One Thing, Keep the Rest',
  intro: 'Say what should change and only that part moves. The subject, the layout and every other word stay as they were.',
  labels: { before: 'Before', after: 'After', reference: 'Reference' },
  items: [
    {
      title: 'A room, staged for the listing',
      change: 'Clutter cleared and golden-hour light added. The walls, windows, sofa and painting stay exactly where they were.',
      before: caseImage('room-phone', 'Real phone photo: a penthouse living room at dusk with a bouclé sofa, a travertine table and tall city windows, shopping bags, a delivery box and a robot vacuum on the floor'),
      after: caseImage('room-staged', 'Real example: the same penthouse living room from the same angle, clutter cleared, warm golden-hour light, a vase of white branches on the table'),
    },
    {
      title: 'Five edits on one poster',
      change: 'The special, a drink, its price, the days and the offer. The hand lettering, the photo and every other line are untouched.',
      before: caseImage('poster-en-before', 'Real example: a forest-style café poster for Little Fern Café, hand-lettered Hello, Autumn! over an iced oat latte, with a three-drink menu and prices'),
      after: caseImage('poster-en-after', 'Real example: the same poster with five edits: Matcha & chestnut specials, Chestnut Oat Latte at a new price, Every day, Buy 2, get 1 free'),
    },
    {
      title: 'A new case colour, every word kept',
      change: 'The oxblood case and box turn sapphire blue. The brand, the shade name, the tagline and the lipstick itself stay as they were.',
      before: caseImage('lipstick-before', 'Real example: a luxury lipstick ad for a made-up brand, an oxblood faceted case and box on travertine with ivory satin, shade No. 214 · Rouge Nocturne'),
      after: caseImage('lipstick-after', 'Real example: the same lipstick ad with the case and box in sapphire blue, every word of the ad unchanged'),
    },
    {
      title: 'Your own drink in a finished shot',
      change: 'A phone photo of a strawberry matcha latte replaces the boba tea. The counter, backdrop, light and angle stay; the props follow the new drink.',
      before: caseImage('drink-before', 'Real example: a studio ad photo of brown-sugar boba milk tea on a terrazzo counter against a peach backdrop'),
      after: caseImage('drink-after', 'Real example: the same studio set with the strawberry matcha latte from the phone photo in place of the boba tea, strawberries and matcha powder beside it'),
      reference: caseImage('drink-ref', 'Real phone photo: a layered strawberry matcha latte in a plastic cup, held up in a busy shop'),
    },
  ],
}

const copy = {
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
    before: withFirstFrame(catPhone),
    after: catAnime,
    caption: 'Your phone photo → anime style: the same cat, now drawn',
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
      value: `${tierPixels} for a square photo, in ${sizeCountWord} sizes from a square listing to a 9:16 story. ${brand} makes each photo in about ${photoSeconds} seconds.`,
    },
  ],
  headings: {
    facts: 'What an Image to Image Generator Needs From You',
    faq: 'Image to Image Generator FAQ',
    related: `More From ${brand}`,
  },
  landing: {
    // GEO (03-S3): one platform rule with the date it was checked.
    factsNote: `These are ${brand}'s own limits and sizes, the same on every page of this site. Shopify says ${px(shopify.squarePx)} × ${px(shopify.squarePx)} px usually displays best for square product images, and Amazon prefers more than ${px(amazon.zoomPx)} px on the longest side for zoom (both checked ${PLATFORM_SPECS_CHECKED.en}).`,
    shoot: catStyles,
    edits,
  },
} as const

export const makeImageToImageGenerator = (offers: OfferFacts) => defineContentPage({
  ...copy,
  costBills: productBills(offers,
    `What ${SET_PHOTOS} Product Photos Cost: Photographer vs Image to Image`,
    `One product, ${SET_PHOTOS} styled photos, retouched and ready to post. The same job, two bills.`,
  ),
  faq: [
    {
      question: 'What is an image to image generator?',
      answer:
        'An image to image generator is a tool that takes a photo you already have and makes a new version of it, instead of starting from a text description. You keep the real subject and get a new look.',
    },
    {
      question: 'Do I need to write a prompt?',
      answer: `${brand} needs no prompt: you pick a template and it handles the rest. Some templates ask for a short line of text, such as a headline and a price for a poster.`,
      link: { href: '/', anchor: 'Browse every template in our image to image AI studio.' },
    },
    {
      question: 'Will the generator change my product, dish or room?',
      answer:
        'Templates are built to keep the subject as shot: the shape, the colors, the label, the food or the room layout. They change the light, the background, the scene or the art style; food templates may also swap the plate or bowl.',
    },
    {
      question: 'What photos work best?',
      answer: `A sharp phone photo with the whole subject in the frame and even light. You can upload ${uploadLimits}. Output sizes are ${tierPixels}.`,
    },
    {
      question: 'How much does the image to image generator cost?',
      answer: `${brand} gives new users ${freeImagesLabel}. ${plansSentence(offers)}`,
    },
  ],
  related: [
    { href: '/', anchor: 'AI image to image', note: 'The studio: templates for food, products, rooms, pets and art styles.' },
    { href: '/commercial-photography', anchor: 'Commercial photography', note: 'For shops and sellers who need studio product shots without a photographer.' },
    { href: '/ai-restaurant-menu', anchor: 'AI restaurant menu photos', note: 'For restaurants that need menu and delivery-app photos from a phone shot.' },
    pricingRelated(offers),
  ],
})

export const imageToImageGenerator = makeImageToImageGenerator(baselineOffers)
