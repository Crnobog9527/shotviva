// Whether a library vessel would look like the user's own (Owner 2026-11-15: a swap to a near-copy
// of the user's plate is no swap). Words only, no model: the vessel's shape line against the dish
// reading's dishware text, both English. Alike = they share a colour family AND an outline family.

const COLOURS: Record<string, readonly string[]> = {
  white: ['white', 'ivory', 'cream', 'bone', 'off-white', 'porcelain'],
  green: ['celadon', 'green', 'jade', 'moss'],
  dark: ['black', 'charcoal', 'dark'],
  grey: ['grey', 'gray', 'slate', 'stone', 'ash'],
  brown: ['brown', 'sand', 'beige', 'tan', 'clay', 'terracotta', 'wood', 'walnut'],
  metal: ['bronze', 'copper', 'silver', 'gold', 'brass', 'metal'],
  blue: ['blue', 'cobalt', 'indigo'],
  red: ['red', 'crimson', 'maroon'],
  glass: ['glass', 'clear', 'transparent'],
}

const OUTLINES: Record<string, readonly string[]> = {
  oval: ['oval', 'oblong', 'elliptical'],
  round: ['round', 'circular', 'disc'],
  square: ['square', 'rectangular', 'rectangle'],
  boat: ['boat', 'teardrop', 'leaf', 'fish-shaped'],
  bowl: ['bowl', 'tureen', 'pot', 'casserole', 'claypot'],
}

function families(text: string, table: Record<string, readonly string[]>): Set<string> {
  const words = new Set(text.toLowerCase().split(/[^a-z-]+/).filter(Boolean))
  return new Set(Object.entries(table).filter(([, terms]) => terms.some((term) => words.has(term))).map(([family]) => family))
}

const shares = (a: Set<string>, b: Set<string>) => [...a].some((family) => b.has(family))

export function looksAlike(shape: string, userDishware: string): boolean {
  return shares(families(shape, COLOURS), families(userDishware, COLOURS))
    && shares(families(shape, OUTLINES), families(userDishware, OUTLINES))
}
