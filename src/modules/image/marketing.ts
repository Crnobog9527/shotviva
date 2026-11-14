// The module's second public entry, for marketing and sign-in pages only (performance B7).
// A server page that imports index.ts registers every client component the barrel exports
// (workspace, photo detail, edit flow, generation runner...) in that page's client bundle, so the
// home page shipped the whole app. This entry exports only what those pages render.
export { toCatalogueTemplate, type CatalogueTemplate } from './catalogue/catalogue-template'
export { pickerBrowse } from './catalogue/picker-browse'
export { HomeGenerator, type HomeGeneratorProps } from './home/home-generator'
export { HomeDraftNote } from './home/home-draft-note'
export type { HomeViewer } from './home/home-cta'
