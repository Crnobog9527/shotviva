import type { TemplateCard } from '@/core/content'

// Static placeholder list until T3's templates table is seeded; names and uses stay in the HTML source.
export const featuredTemplates: readonly [TemplateCard, ...TemplateCard[]] = [
  { name: 'Studio white', use: 'Clean white backdrop for delivery-app menus.' },
  { name: 'Rustic table', use: 'Warm wooden table for comfort food and bakeries.' },
  { name: 'Dark moody', use: 'Low-key light for steaks, cocktails and desserts.' },
  { name: 'Bright cafe', use: 'Daylight cafe scene for coffee and brunch plates.' },
  { name: 'Menu card', use: 'Dish photo with your dish name and price as text.' },
  { name: 'Social square', use: 'Square crop sized for Instagram posts.' },
]
