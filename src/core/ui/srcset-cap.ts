// next/image puts every configured width at or above the smallest `vw` share of `sizes` into the
// srcset: a 276 px template card listed ten files, 256 w to 3840 w, about 2.6 KB of markup per
// picture and 260 KB of the home page's HTML (2026-11-14). A browser takes the first candidate at
// least slot × device pixel ratio wide, so for a slot whose widest rendering is known everything
// past the first width covering twice that is never picked on a 1× or 2× screen; a 3× screen gets
// the 2× file, the same cap next/image applies to fixed-width images (its getWidths). Phones are
// unaffected: their `vw` slots are already sized for about 2× (phone-sizes.ts).

// `(min-width: Npx) <length>` entries, widest first, then one bare default length.
const ENTRY = /^(?:\(min-width:\s*(\d+)px\)\s+)?(\d+(?:\.\d+)?)(px|vw)$/

// The widest CSS width the slot is ever drawn at, or null when `sizes` has another shape or a
// `vw` length with no viewport bound above it (then nothing is dropped).
export function slotMaxPx(sizes: string): number | null {
  const entries = sizes.split(',').map((entry) => ENTRY.exec(entry.trim()))
  let widest = 0
  let below = Number.POSITIVE_INFINITY
  for (const [index, match] of entries.entries()) {
    if (!match) return null
    const minWidth = match[1] === undefined ? null : Number(match[1])
    const last = index === entries.length - 1
    if ((minWidth === null) !== last || (minWidth !== null && minWidth >= below)) return null
    const value = Number(match[2])
    const slot = match[3] === 'px' ? value : (value / 100) * below
    if (!Number.isFinite(slot)) return null
    widest = Math.max(widest, slot)
    if (minWidth !== null) below = minWidth
  }
  return widest
}

type Candidate = { entry: string; href: string; width: number }

function candidatesOf(srcSet: string): Candidate[] | null {
  const candidates = srcSet.split(', ').map((entry) => {
    const space = entry.lastIndexOf(' ')
    const descriptor = entry.slice(space + 1)
    return { entry, href: entry.slice(0, space), width: descriptor.endsWith('w') ? Number(descriptor.slice(0, -1)) : Number.NaN }
  })
  return candidates.every((candidate) => Number.isFinite(candidate.width)) ? candidates : null
}

// srcset and src without the candidates no screen up to 2× would pick; src (only read by a
// browser without srcset) becomes the widest one kept, as next/image makes it the widest listed.
export function capSrcSet<T extends { srcSet?: string; src: string }>(image: T, sizes: string | undefined): T {
  const widest = sizes ? slotMaxPx(sizes) : null
  const candidates = image.srcSet && widest !== null ? candidatesOf(image.srcSet) : null
  if (!candidates || widest === null) return image
  const limit = candidates.find((candidate) => candidate.width >= 2 * widest)?.width ?? Number.POSITIVE_INFINITY
  const kept = candidates.filter((candidate) => candidate.width <= limit)
  return { ...image, srcSet: kept.map((candidate) => candidate.entry).join(', '), src: kept.at(-1)?.href ?? image.src }
}
