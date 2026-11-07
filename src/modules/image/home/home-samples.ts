import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// A template's phone → AI pair for the generator: the covers the admin uploaded (T53: no
// bundled samples), or nothing until both are there.
export type TemplateSample = { before: string; after: string }

export function sampleFor(template: CatalogueTemplate): TemplateSample | null {
  const { before, after } = template.cover
  return before && after ? { before, after } : null
}

export function thumbFor(template: CatalogueTemplate): string | null {
  return template.cover.after ?? template.cover.poster ?? null
}
