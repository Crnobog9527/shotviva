import type { CatalogueTemplate } from '../catalogue/catalogue-template'

// A template's phone → AI pair for the generator: its admin cover when set, else the bundled
// illustrative sample the page hands over (public/home/templates, by template id).
export type TemplateSample = { before: string; after: string }
export type SampleLookup = Readonly<Record<string, TemplateSample>>

export function sampleFor(template: CatalogueTemplate, bundled: SampleLookup): TemplateSample | null {
  const { before, after } = template.cover
  if (before && after) return { before, after }
  return bundled[template.id] ?? null
}

export function thumbFor(template: CatalogueTemplate, bundled: SampleLookup): string | null {
  return template.cover.after ?? template.cover.poster ?? bundled[template.id]?.after ?? null
}
