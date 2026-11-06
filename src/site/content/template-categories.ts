import type { CategoryCopy } from '@/core/content'

// The six template categories of ARCHITECTURE §5, in its order (Art Styles first, 建站规格 §4
// H2-2): each one's H3 and intro on the home page. `key` is the value stored in
// templates.category. Which templates show under them is chosen in admin (featured_rank, T53);
// a category with none is hidden. When an inner page goes live, add it to its category's
// `links` (Food → /ai-restaurant-menu; Products → /commercial-photography).
export const templateCategories: readonly [CategoryCopy, ...CategoryCopy[]] = [
  {
    key: 'Art Styles',
    name: 'Art Styles',
    drag: true,
    intro: 'Turn a phone photo into a drawing. The pose, the layout and the subject stay as shot.',
  },
  {
    key: 'Food & Drink',
    name: 'Food & Drink',
    intro: 'Turn a phone photo of a dish or a drink into a menu photo or a poster. The food and the plate stay as served.',
  },
  {
    key: 'Products & Resale',
    name: 'Products & Resale',
    intro: 'Shoot a product on any table and get a store-ready photo. The label, color and shape stay the same.',
  },
  {
    key: 'Beauty & Skincare',
    name: 'Beauty & Skincare',
    intro: 'Put a bottle, jar or tube from your phone photo on a clean brand set. The packaging stays as it is.',
  },
  {
    key: 'Rooms & Spaces',
    name: 'Rooms & Spaces',
    intro: 'Make a room photo brighter or warmer. Walls, windows and furniture stay where they are.',
  },
  {
    key: 'Pets',
    name: 'Pets',
    intro: 'Turn a snapshot of your pet into a studio portrait. Your pet still looks like your pet.',
  },
]
