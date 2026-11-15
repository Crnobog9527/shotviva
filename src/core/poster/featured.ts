import type { PosterPrizes } from './content'
import type { PosterFeatured } from './template'

// 展示位 (ARCHITECTURE §5.3, Owner 2026-11-15): which prizes the display area draws as products.
// Pure and shared by the editor (which marks and pictures them) and generation (which tells the
// model). Rows carry their spot; a set saved before anyone picked reads as the top rows.

export type FeaturedPrize = { spot: number; row: number; rank: string; rankEn: string; prize: string }

type Rows = PosterPrizes['rows']

// The featured prizes in list order. Spots outside the template's count, and a spot taken twice
// (the first row keeps it), count as not featured.
export function featuredPrizes(rows: Rows | undefined, featured: Pick<PosterFeatured, 'count'> | undefined): FeaturedPrize[] {
  if (!featured || !rows?.length) return []
  const taken = new Set<number>()
  const marked = rows.flatMap((row, i) => {
    const spot = row.featured
    if (spot === undefined || spot > featured.count || taken.has(spot)) return []
    taken.add(spot)
    return [{ spot, row: i, rank: row.rank, rankEn: row.rankEn, prize: row.prize }]
  })
  if (marked.length > 0) return marked
  return rows.slice(0, featured.count).map((row, i) => ({ spot: i + 1, row: i, rank: row.rank, rankEn: row.rankEn, prize: row.prize }))
}

// The rows with their spots written in (the top rows when none is picked yet), so later edits,
// such as removing a row above, never move a prize's photo onto another prize.
export function withFeaturedSpots(rows: Rows, featured: Pick<PosterFeatured, 'count'> | undefined): Rows {
  if (!featured) return rows
  const spots = new Map(featuredPrizes(rows, featured).map((item) => [item.row, item.spot]))
  return rows.map((row, i) => {
    const spot = spots.get(i)
    return spot === undefined ? textOnly(row) : { ...row, featured: spot }
  })
}

// Featuring a row takes the lowest free spot (none free: unchanged); unfeaturing frees its spot,
// except the last one: the display area always draws at least one prize. `freed` is the spot
// whose photo no longer belongs to any prize, and `taken` the one now assigned (its old photo,
// if any, belonged to a prize since removed).
export function toggleFeatured(rows: Rows, index: number, on: boolean, featured: Pick<PosterFeatured, 'count'>): { rows: Rows; freed?: number; taken?: number } {
  const current = withFeaturedSpots(rows, featured)
  const row = current[index]
  if (!row) return { rows }
  const used = current.flatMap((item) => (item.featured === undefined ? [] : [item.featured]))
  if (on) {
    if (row.featured !== undefined) return { rows: current }
    const spot = Array.from({ length: featured.count }, (_, i) => i + 1).find((n) => !used.includes(n))
    if (spot === undefined) return { rows: current }
    return { rows: current.map((item, i) => (i === index ? { ...item, featured: spot } : item)), taken: spot }
  }
  if (row.featured === undefined || used.length <= 1) return { rows: current }
  return { rows: current.map((item, i) => (i === index ? textOnly(item) : item)), freed: row.featured }
}

const textOnly = (row: Rows[number]): Rows[number] => ({ rank: row.rank, rankEn: row.rankEn, prize: row.prize })

// The photo slot of a spot, or null when the template takes no photos for it.
export const featuredPhotoSlot = (featured: PosterFeatured | undefined, spot: number): string | null => featured?.photos[spot - 1] ?? null

// Photo slots no featured prize holds: never sent, so the model only sees featured prizes' photos.
export function unusedPhotoSlots(featured: PosterFeatured | undefined, rows: Rows | undefined): string[] {
  if (!featured) return []
  const held = new Set(featuredPrizes(rows, featured).map((item) => featuredPhotoSlot(featured, item.spot)))
  return featured.photos.filter((key) => !held.has(key))
}

// What the prize page's text adds for the model: which prizes the display area draws, in order,
// each mapped to its attached image (`imageOf` gives the 1-based number it is sent as) or drawn as
// the real product named. Data only; the template's prompt says how the display area looks.
export function displayAreaText(items: readonly FeaturedPrize[], imageOf: (spot: number) => number | null): string {
  if (items.length === 0) return ''
  const name = (item: FeaturedPrize) => [item.rank, item.prize].filter(Boolean).join(' | ')
  return [
    `[Display area: the ${items.length} featured prize${items.length > 1 ? 's' : ''} drawn as products, left to right; picture only, never text to set]`,
    ...items.map((item, i) => {
      const image = imageOf(item.spot)
      return `Featured ${i + 1}: ${name(item)} - ${image ? `draw exactly the product in Image ${image}` : 'no photo: draw the real product named'}`
    }),
    'Every other prize appears only as text in the prize list, never as a product.',
  ].join('\n')
}
