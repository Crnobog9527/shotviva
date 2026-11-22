// The module's entry for a template collection share page (/s/t/<id>, ARCHITECTURE §5.1g). Its
// own entry, as share-page.ts: a page that imports an entry registers every client component it
// exports, so no other page carries this one's code (scripts/js-budget.json).
export { loadTemplateCollection, type TemplateCollection } from './template-share/load-template-collection'
export { TemplateCollectionPage, type CollectionPageText } from './template-share/template-collection-page'
export { CollectionViewer, CollectionViewerStatus } from './template-share/collection-viewer'
