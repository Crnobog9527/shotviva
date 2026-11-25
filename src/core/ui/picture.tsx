import type { ReactNode } from 'react'

import type { AvifSource } from './cover-image'

// The AVIF copies of a pre-sized picture in front of its <img> (core/presized): browsers that take
// AVIF load those, the rest the <img>'s WebP srcset. The format is in each file's URL, so the CDN
// keeps one object per URL whatever the Accept header. display: contents, so the <img> still lays
// out as a direct child of the element around it; without AVIF copies the <img> renders alone.
const CONTENTS = { display: 'contents' } as const
// A <source> is display: inline by default (it is not in the UA sheet's display: none list), so
// under display: contents it became a box of its own in the parent: an empty first cell in a grid
// or flex row. The picker's sample pair (two columns) showed an empty left plate and the phone
// photo under the AI tag (Owner 2026-11-25). Selection reads the attributes only, not the box.
const NO_BOX = { display: 'none' } as const

export function Picture({ avif, children }: { avif: AvifSource | undefined; children: ReactNode }) {
  if (!avif) return children
  return (
    <picture style={CONTENTS}>
      <source type="image/avif" srcSet={avif.srcSet} sizes={avif.sizes} style={NO_BOX} />
      {children}
    </picture>
  )
}
