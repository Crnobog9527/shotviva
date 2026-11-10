import type { ImageRef, WishlistPromo } from '@/core/content'

// Home: "Can't find your template?" (Owner 2026-11-10), under the template grid while the
// wishlist is open. Three pains, three answers; no timelines and no notification promises
// (ARCHITECTURE §15.4: the wishlist sends nothing). The wish cards are examples, said in the
// alt text and the note, never on the picture (The No Badge Rule). The vote counts are part of
// the illustration, not live data.
const ref = (file: string, width: number, height: number, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width, height })

export const homeWishlist: WishlistPromo = {
  heading: { lead: "Can't find your template? ", emphasis: 'Make a wish', tail: " and we'll build it" },
  intro: 'The Wishlist is where sellers ask for the templates they need and vote on what gets built next.',
  points: [
    {
      heading: 'Your niche is not covered yet',
      text: 'Describe the look you want in a sentence and add one reference photo. No prompt writing.',
    },
    {
      heading: 'Other sellers vote',
      text: 'Everyone can back the wishes they want too. The most-wanted get built first.',
    },
    {
      heading: 'Shipped wishes are pinned',
      text: 'When a wish becomes a template, it is pinned to the top of the Wishlist. One tap to use it.',
    },
  ],
  examples: [
    {
      image: ref('example-dish-before', 900, 1125, 'Reference photo for a wish: a dish on a restaurant kitchen pass (illustrative example)'),
      text: 'A dark, moody poster for our weekend brunch menu',
      votes: 46,
      shipped: false,
    },
    {
      image: ref('hero-set-phone', 1080, 1350, 'Reference photo for a wish: a woven leather tote on a kitchen counter (illustrative example)'),
      text: 'Bags on a pale stone plinth with a soft shadow',
      votes: 87,
      shipped: true,
    },
    {
      image: ref('example-skincare-before', 900, 1125, 'Reference photo for a wish: a skincare jar on a bathroom shelf (illustrative example)'),
      text: 'Skincare on wet sand, beach light',
      votes: 31,
      shipped: false,
    },
  ],
  note: 'Wish cards shown are illustrative examples. Make one photo first, then you can post wishes and vote.',
  labels: { shipped: 'Shipped', votes: 'votes' },
  cta: { signedOut: 'Sign up to make a wish', signedIn: 'Go to the Wishlist' },
}
