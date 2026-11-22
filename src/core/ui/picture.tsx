import { isValidElement, type ReactNode } from 'react'

import type { AvifSource } from './cover-image'

// The AVIF copies of a pre-sized picture in front of its <img> (core/presized): browsers that take
// AVIF load those, the rest the <img>'s WebP srcset. The format is in each file's URL, so the CDN
// keeps one object per URL whatever the Accept header. display: contents, so the <img> still lays
// out as a direct child of the element around it; without AVIF copies the <img> renders alone.
//
// Only first-screen pictures get the source: a lazy <img> (below the fold) renders alone, on its
// WebP srcset. Every <source> adds its srcset to the HTML and the RSC payload, and on desktop that
// markup cost more first-paint time than AVIF saved on pictures loaded after it (/zh LCP 193 →
// 208 ms with a source on all 31, 2026-11-22). Eager, prioritised and preloaded ones keep AVIF:
// they are the bytes a slow link waits for.
const CONTENTS = { display: 'contents' } as const

const isLazy = (children: ReactNode) => isValidElement<{ loading?: unknown }>(children) && children.props.loading === 'lazy'

export function Picture({ avif, children }: { avif: AvifSource | undefined; children: ReactNode }) {
  if (!avif || isLazy(children)) return children
  return (
    <picture style={CONTENTS}>
      <source type="image/avif" srcSet={avif.srcSet} sizes={avif.sizes} />
      {children}
    </picture>
  )
}
