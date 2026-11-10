import type { ImageRef, WishlistPromo } from '@/core/content'

// Home: "Can't find your template?" (Owner 2026-11-10), under the template grid while the
// wishlist is open. Three pains, three answers; no timelines and no notification promises
// (ARCHITECTURE §15.4: the wishlist sends nothing). The wish cards are examples, said in the
// alt text and the note, never on the picture (The No Badge Rule). Each picture is the look the
// shop owner wished for, not the reference photo they would upload, and the kinds come in light
// and dark pairs so a visitor sees both moods. The vote counts are part of the illustration, not
// live data.
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
      image: ref('wish-brunch-dark', 1080, 1080, 'The look wished for (illustrative): a dark, moody weekend brunch menu poster'),
      text: 'Can you make a weekend brunch poster template? Dark and moody, with my menu and prices right on it',
      votes: 46,
      shipped: false,
    },
    {
      image: ref('wish-cafe-light', 1080, 1080, 'The look wished for (illustrative): a bright, wood-and-plants café grand-opening poster'),
      text: 'Our café opens next month. I want an opening poster template I can make from photos of my own shop',
      votes: 64,
      shipped: false,
    },
    {
      image: ref('wish-tea-dark', 1080, 1080, 'The look wished for (illustrative): a dark, premium new-flavor milk tea poster'),
      text: 'We\'re launching a new milk tea. I want a dark, premium-looking new-flavor poster',
      votes: 38,
      shipped: false,
    },
    {
      image: ref('wish-bag-stone', 1080, 1080, 'The look wished for (illustrative): a leather bag on a pale stone plinth with a soft shadow'),
      text: 'I sell handbags. I want that bag-on-a-pale-stone-plinth look with a soft shadow, so it feels premium',
      votes: 87,
      shipped: true,
    },
    {
      image: ref('wish-lunch-light', 1080, 1080, 'The look wished for (illustrative): a bright, fresh lunch specials menu poster'),
      text: 'I need a weekday lunch specials poster — bright and fresh, with the menu on it',
      votes: 41,
      shipped: false,
    },
    {
      image: ref('wish-cafe-evening', 1080, 1080, 'The look wished for (illustrative): a flower-filled street café at dusk, as an evening poster'),
      text: 'I want an evening poster to pull people into my café: the street, the flowers, that just-after-sunset glow',
      votes: 57,
      shipped: false,
    },
    {
      image: ref('wish-tea-light', 1080, 1080, 'The look wished for (illustrative): a fresh "2nd cup half price" milk tea promo poster'),
      text: 'We do 2nd cup half price every Wednesday. I want a fresh promo poster I can reuse every week',
      votes: 52,
      shipped: false,
    },
    {
      image: ref('wish-skincare-stone', 1080, 1080, 'The look wished for (illustrative): skincare bottles on warm stone with sunlight and leaf shadows'),
      text: 'Please make a skincare template! I want my bottles on warm stone with sunlight and leaf shadows',
      votes: 31,
      shipped: false,
    },
  ],
  note: 'Wish cards shown are illustrative examples. Make one photo first, then you can post wishes and vote.',
  labels: { shipped: 'Shipped', votes: 'votes' },
  cta: { signedOut: 'Sign up to make a wish', signedIn: 'Go to the Wishlist' },
}
