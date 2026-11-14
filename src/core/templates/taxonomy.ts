import { z } from 'zod'

import { CATEGORY_KEY_PATTERN, toCategory, type Category, type CategoryRow } from './categories'

export const pathSchema = z.array(z.string().regex(CATEGORY_KEY_PATTERN)).min(1).max(3)
export const cursorSchema = z.object({ order: z.int(), key: z.string().regex(CATEGORY_KEY_PATTERN) })

export type CatalogueCursor = z.infer<typeof cursorSchema>
export type CataloguePage<T> = { items: T[]; nextCursor: CatalogueCursor | null }
export const PAGE_SIZE = 30

export type TaxonomyRow = CategoryRow & {
  parent_id: string | null
  slug: string
  level: number
  seo_title_en: string | null
  seo_title_zh: string | null
  seo_description_en: string | null
  seo_description_zh: string | null
}

export type CategoryNode = Category & {
  slug: string
  level: number
  path: string[]
  seo: { en: { title: string | null; description: string | null }; zh: { title: string | null; description: string | null } }
  children: CategoryNode[]
}

// Only visible template nodes are supplied. A missing (hidden) ancestor excludes its subtree.
export function buildCategoryTree(rows: TaxonomyRow[]): CategoryNode[] {
  const children = new Map<string | null, TaxonomyRow[]>()
  for (const row of rows) {
    const siblings = children.get(row.parent_id) ?? []
    siblings.push(row)
    children.set(row.parent_id, siblings)
  }
  function branch(parent: string | null, prefix: string[]): CategoryNode[] {
    return (children.get(parent) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key))
      .map((row) => {
        const path = [...prefix, row.slug]
        return {
          ...toCategory(row), slug: row.slug, level: row.level, path,
          seo: {
            en: { title: row.seo_title_en, description: row.seo_description_en },
            zh: { title: row.seo_title_zh, description: row.seo_description_zh },
          },
          children: branch(row.key, path),
        }
      })
  }
  return branch(null, [])
}
