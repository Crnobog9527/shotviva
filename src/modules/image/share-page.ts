// The module's entry for a template's share page (/t/<id>, Owner 2026-11-13). Its own entry, not
// marketing.ts: a page that imports an entry registers every client component it exports, so the
// home page would carry the share page's code (scripts/js-budget.json).
export { loadSharedTemplate, type SharedTemplate } from './share/load-shared-template'
export { SharedTemplateMissing, SharedTemplatePage } from './share/shared-template-page'
export { ShareCta } from './share/share-cta'
