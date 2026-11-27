import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// A group of templates the creation panel can switch between (set-create-dialog.tsx): a series
// (one category, its own name), or a 精选组合 (any categories, hand-picked for the home page, Owner
// 2026-11-25). With one member and no kind it is a lone template: no strip. A plain file so the
// public pages can name it without reaching the panel's components (scripts/public-css-sources).
export type TemplateSet = { id: string; kind: 'series' | 'bundle' | null; name: string; members: CatalogueTemplate[] }
