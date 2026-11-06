'use client'

import { useTranslations } from 'next-intl'

// Categories are data (templates.category, English); their display name comes from
// app.categories in the page's language, and a category without one shows as stored.
export function useCategoryLabel(): (category: string) => string {
  const t = useTranslations('app.categories')
  return (category) => (t.has(category) ? t(category) : category)
}
