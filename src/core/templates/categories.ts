// The catalogue's categories (ARCHITECTURE §5), stored by English name in templates.category;
// pages show app.categories in their language. The admin picks from these so a typo ("products")
// cannot open a seventh chip on Create; a genuinely new category is still allowed there.
export const TEMPLATE_CATEGORIES = ['Food & Drink', 'Products & Resale', 'Beauty & Skincare', 'Rooms & Spaces', 'Pets', 'Art Styles'] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export function isKnownCategory(category: string): category is TemplateCategory {
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(category)
}
