// The module's third public entry, for the dense-text poster routes (ARCHITECTURE §5.3),
// like marketing.ts (performance B7): index.ts would register the poster editor's client
// components in every page that imports it (/generate, /photos), and those pages have a JS budget.
export { EXTRACT_TEXT_MAX, loadStudioTemplate, posterAllowed, prepareExtract, runExtract } from './poster'
