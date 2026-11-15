// Whether a library vessel would look like the user's own (Owner 2026-11-15: a swap to a near-copy
// of the user's plate is no swap). Words only, no model: the vessel's shape line against the dish
// reading's dishware text, both English. Alike = they share a colour family AND an outline family.

// Colour words only: a material (porcelain, stone, clay, wood, glass) says nothing about colour, so
// a blue porcelain plate is never taken for a white one.
const COLOURS: Record<string, readonly string[]> = {
  white: ['white', 'ivory', 'cream', 'bone', 'off-white'],
  green: ['celadon', 'green', 'jade', 'moss'],
  dark: ['black', 'charcoal', 'dark'],
  grey: ['grey', 'gray', 'slate', 'ash'],
  brown: ['brown', 'sand', 'beige', 'tan', 'terracotta'],
  metal: ['bronze', 'copper', 'silver', 'gold', 'brass'],
  blue: ['blue', 'cobalt', 'indigo'],
  red: ['red', 'crimson', 'maroon'],
  clear: ['clear', 'transparent'],
}

const OUTLINES: Record<string, readonly string[]> = {
  oval: ['oval', 'oblong', 'elliptical'],
  round: ['round', 'circular', 'disc'],
  square: ['square', 'rectangular', 'rectangle'],
  boat: ['boat', 'teardrop', 'leaf', 'fish-shaped'],
  bowl: ['bowl', 'tureen', 'pot', 'casserole', 'claypot'],
}

// Each hyphenated compound counts whole and by its parts: 'ivory-white' is white, 'oval-shaped'
// is oval, and 'off-white' / 'fish-shaped' still match as listed.
function wordsOf(text: string): Set<string> {
  const compounds = text.toLowerCase().split(/[^a-z-]+/).filter(Boolean)
  return new Set(compounds.flatMap((compound) => [compound, ...compound.split('-').filter(Boolean)]))
}

function families(text: string, table: Record<string, readonly string[]>): Set<string> {
  const words = wordsOf(text)
  return new Set(Object.entries(table).filter(([, terms]) => terms.some((term) => words.has(term))).map(([family]) => family))
}

const shares = (a: Set<string>, b: Set<string>) => [...a].some((family) => b.has(family))

export function looksAlike(shape: string, userDishware: string): boolean {
  return shares(families(shape, COLOURS), families(userDishware, COLOURS))
    && shares(families(shape, OUTLINES), families(userDishware, OUTLINES))
}

// Same colour family as the user's own vessel (Owner 2026-11-15: 「优先同色系、换器型」). With
// looksAlike already ruled out, a vessel of the user's colour has a different form.
export function sameColourFamily(shape: string, userDishware: string): boolean {
  return shares(families(shape, COLOURS), families(userDishware, COLOURS))
}
