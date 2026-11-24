import { TEMPLATE_REQUESTS_PATH, type TemplateRequestsText } from '@/core/content/template-requests'

import { site } from '../site.config'
import { homeWishlist } from './home-wishlist'

const brand = site.brand.name

// /template-requests (Owner 2026-11-25 SEO plan). Main keyword "custom ai photo template"; the
// secondary phrases (request an AI photo template, custom AI product / food photo template, AI
// template for restaurant or hotel photos) are written into the body. Every answer below follows
// the wishlist as built (ARCHITECTURE §15): reviewed before it shows, one account one vote, at
// least one finished image before posting or voting, five requests a day, reference photos
// re-encoded without location data and shown only on the signed-in wall, a notice when it ships.
// No real request appears on this public page (Owner 2026-11-25): the wall here is examples.
export const templateRequestsPage: TemplateRequestsText = {
  path: TEMPLATE_REQUESTS_PATH,
  label: 'Template requests',
  title: `Request a Custom AI Photo Template | ${brand}`,
  description: "Can't find a template for your photo? Tell us what you have and the result you want. Vote on others' requests: we build the most-wanted ones and add them to Shotviva.",
  h1: "Can't find the right template? Request a custom AI photo template",
  intro: `Tell us what you photographed and the picture you need. Other ${brand} users vote, and the most-wanted requests become templates anyone can use.`,
  cta: { submit: 'Request a template', vote: 'Vote on requests' },
  closed: 'Template requests are paused for now. The templates below are open as usual.',
  steps: {
    heading: 'How template requests work',
    items: [
      {
        heading: 'Describe your photo and the result',
        text: 'Write what you shot and the picture you want, in plain words, and add one to three reference photos. No prompts.',
      },
      {
        heading: 'Others vote for it',
        text: 'Once we have checked it, your request goes on the wall, where other users vote for the ones they want too.',
      },
      {
        heading: 'The most-wanted get built',
        text: 'We build the requests with the most votes first. When yours goes live, you and everyone who voted get a notice on Shotviva.',
      },
    ],
  },
  examples: {
    heading: 'What requests look like',
    intro: 'These wishes are examples. Real requests and their votes are on the wishlist once you sign in.',
    wall: homeWishlist,
  },
  shipped: {
    heading: 'Recently built from requests',
    intro: 'Templates that started as a request on the wishlist.',
    open: 'Open the template',
  },
  good: {
    heading: 'What makes a good request',
    intro: 'A custom AI photo template is easier to build when we know three things.',
    points: [
      { heading: 'Your photo', text: 'What is in it and how you shot it: a dish on the table, a product on a desk, a hotel room from the doorway.' },
      { heading: 'The result you want', text: 'The light, the background, the mood or the style. A reference photo of the look says more than a paragraph.' },
      { heading: 'Where it will be used', text: 'A delivery app, a menu, a product listing, a booking site or a social post, so the size and framing fit.' },
    ],
    examplesHeading: 'Examples',
    examples: [
      'Custom AI food photo template: our noodle bowls shot from above on a dark stone table, warm side light, for the delivery app.',
      'Custom AI product photo template: a candle on a bathroom shelf in soft morning light, square, for our Etsy listing.',
      'AI template for hotel photos: our twin room photographed at night, made to look bright and airy, for the booking site.',
    ],
  },
  today: {
    heading: 'Templates you can use today',
    links: [
      { href: '/ai-restaurant-menu', anchor: 'Food and restaurant templates', note: 'Menu, delivery app and poster photos from a phone shot' },
      { href: '/commercial-photography', anchor: 'Product templates', note: 'Listing shots, lifestyle scenes and promo posters' },
      { href: '/#templates', anchor: 'Hotel and room templates', note: 'Rooms, lobbies and dining spaces, with the food templates' },
    ],
  },
  faqHeading: 'Template request questions',
  faq: [
    {
      question: 'How long does it take for a requested template to be built?',
      answer: 'There is no fixed date. We check each new request before it goes on the wall, then build the ones with the most votes first. When a template you asked for or voted for goes live, you get a notice the next time you open Shotviva.',
    },
    {
      question: 'Does it cost credits to request or vote?',
      answer: `No. Posting a request and voting are free. You need a ${brand} account that has made at least one image, and each account can post up to five requests a day. Using the template once it is live costs the same as any other template.`,
    },
    {
      question: 'Is my photo public?',
      answer: 'No. Your request, its reference photos and your name are shown only to signed-in users on the wishlist, never on this page: the wishes above are examples. Reference photos are re-saved without location data, your name shows as its first letter and three stars, and the photos are deleted if the request is turned down, taken off the wall or your account is closed.',
    },
    {
      question: 'Will the subject of my photo change?',
      answer: `A template built from a request works like every other ${brand} template: it changes the light, the background, the scene or the style and keeps your subject as you shot it, the product and its label, the dish or the room layout.`,
    },
    {
      question: 'Can I request an AI template for restaurant or hotel photos?',
      answer: 'Yes. Dishes, drinks, menus, hotel rooms and dining spaces are all welcome. Say which dish or room it is and where the picture will be used.',
    },
  ],
}
