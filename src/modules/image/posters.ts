// The module's third public entry, for the dense-text poster routes (ARCHITECTURE §5.3),
// like marketing.ts (performance B7): index.ts would register the poster editor's client
// components in every page that imports it (/generate, /photos), and those pages have a JS budget.
export { EXTRACT_TEXT_MAX, loadStudioTemplate, posterAllowed, prepareExtract, preparePhotoExtract, runExtract } from './poster'
// 每周复用 (§5.3): the poster editors' last issue and store details, also used by the prize posters'
// creation dialog; server only.
export { templateIdsOf, weeklyAct, weeklyPeek } from './again/weekly'
