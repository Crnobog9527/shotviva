'use client'

import type { ComponentProps } from 'react'

import { firstFrameOf } from './first-frame-store'

type Props = Omit<ComponentProps<'img'>, 'src' | 'alt'> & { frameKey: string }

// The <img> of a first frame. Its bytes are written by the server only (first-frame-store.ts):
// in the browser this renders without `src`, and React leaves the attribute the server wrote
// alone (an attribute it did not set is never patched), so the frame stays until the full
// picture covers it. After a client-side move there is no frame, and none is needed.
export function FirstFrame({ frameKey, ...img }: Props) {
  // eslint-disable-next-line @next/next/no-img-element -- a data: URI, nothing for next/image to resize
  return <img {...img} src={firstFrameOf(frameKey)} alt="" aria-hidden decoding="sync" suppressHydrationWarning />
}
