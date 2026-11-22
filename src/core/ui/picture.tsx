import type { ReactNode } from 'react'

import type { AvifSource } from './cover-image'

// The AVIF copies of a pre-sized picture in front of its <img> (core/presized): browsers that take
// AVIF load those, the rest the <img>'s WebP srcset. The format is in each file's URL, so the CDN
// keeps one object per URL whatever the Accept header. display: contents, so the <img> still lays
// out as a direct child of the element around it; without AVIF copies the <img> renders alone.
const CONTENTS = { display: 'contents' } as const

export function Picture({ avif, children }: { avif: AvifSource | undefined; children: ReactNode }) {
  if (!avif) return children
  return (
    <picture style={CONTENTS}>
      <source type="image/avif" srcSet={avif.srcSet} sizes={avif.sizes} />
      {children}
    </picture>
  )
}
