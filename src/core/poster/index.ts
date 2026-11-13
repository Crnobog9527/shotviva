// Dense-text posters (ARCHITECTURE §5.3): content blocks, the template's set, the split into
// posters and the text each poster sends. Pure; saving and reading sets is in './sets' (server).
export {
  POSTER_BLOCKS,
  POSTER_LIMITS,
  SECTION_STYLES,
  cleanPosterLine,
  posterChars,
  posterContentSchema,
  posterStrings,
  sectionChars,
  type PosterBlock,
  type PosterContent,
  type PosterPrizes,
  type PosterSection,
  type PosterTable,
  type TableRow,
} from './content'
export { partText } from './format'
export { splitPoster, tablePages, type PosterPart } from './split'
export { kindFor, posterFieldsSchema, type PosterCapacity, type PosterFields, type PosterKind } from './template'
export { normalizeForMatch, unverifiedPaths } from './verbatim'
