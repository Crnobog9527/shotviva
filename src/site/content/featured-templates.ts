import type { TemplateCategory } from '@/core/content'

// First batch: 6 categories, 10 templates (ARCHITECTURE §5). Ids are the templates-table ids
// the comps use (design/comps-v3-b/js/studio.js); the bundled illustrative pair for each sits in
// public/home/templates/<id>-before|after.webp. Art Styles comes first
// (建站规格 §4 H2-2). Static until T8 reads the templates table; names and uses stay in
// the HTML source (R5). When an inner page goes live, add it to its category's `links`
// (Food → /ai-restaurant-menu, /ai-food-photography; Products → /commercial-photography;
// Rooms → /interior-photography, /architectural-photography).
export const templateCategories: readonly [TemplateCategory, ...TemplateCategory[]] = [
  {
    name: 'Art Styles',
    intro: 'Turn a phone photo into a drawing. The pose, the layout and the subject stay as shot.',
    templates: [
      { id: 'korean-manhwa', name: 'Korean Manhwa', use: 'Redraws your photo in a clean Korean manhwa style, same pose and framing.' },
    ],
  },
  {
    name: 'Food & Drink',
    intro: 'Turn a phone photo of a dish or a drink into a menu photo or a poster. The food and the plate stay as served.',
    templates: [
      { id: 'delivery-photo', name: 'Delivery Menu', use: 'Bright, clean dish photos for delivery apps and menus.' },
      { id: 'dark-dining', name: 'Dark Dining', use: 'Low, moody light for dinner and drinks posts on social media.' },
      { id: 'promo-poster', name: 'Promo Poster', use: 'One poster with your photo, a short headline and a price.' },
    ],
  },
  {
    name: 'Products & Resale',
    intro: 'Shoot a product on any table and get a store-ready photo. The label, color and shape stay the same.',
    templates: [
      { id: 'pure-white', name: 'Pure White', use: 'A white-background main photo for online stores and resale listings.' },
      { id: 'lifestyle-table', name: 'Lifestyle Table', use: 'Your product on a styled table, ready for social posts.' },
    ],
  },
  {
    name: 'Beauty & Skincare',
    intro: 'Put a bottle, jar or tube from your phone photo on a clean brand set. The packaging stays as it is.',
    templates: [{ id: 'spa-podium', name: 'Spa Podium', use: 'Skincare and beauty products on a soft spa podium.' }],
  },
  {
    name: 'Rooms & Spaces',
    intro: 'Make a room photo brighter or warmer. Walls, windows and furniture stay where they are.',
    templates: [
      { id: 'bright-listing', name: 'Bright Listing', use: 'Brighter, cleaner rental listing photos without changing the room.' },
      { id: 'evening-glow', name: 'Evening Glow', use: 'Warm evening light for a cozy look.' },
    ],
  },
  {
    name: 'Pets',
    intro: 'Turn a snapshot of your pet into a studio portrait. Your pet still looks like your pet.',
    templates: [{ id: 'pet-studio', name: 'Pet Studio', use: 'A studio portrait with soft light and a plain backdrop.' }],
  },
]
