'use client'

import { getImageProps } from 'next/image'
import { useEffect, useState } from 'react'

import { naturalSize } from '../workspace/photo-ratio'

// A picture in the generator's preview with its real shape (width / height), so the frame can
// take that shape and show the whole picture (Owner 2026-11-12: never crop a template's cover).
// `firstFrame`: the server holds a small inline copy of the opening cover and writes it into the
// markup (core/templates/cover-ratio.ts, core/ui/first-frame.tsx).
export type StageCover = { url: string; ratio: number; firstFrame?: boolean }

// The optimiser's copies the stage shows: a 320 px wide 1x / 2x pair (384 and 640 px), enough for
// the 320 px desktop frame and the ~340 px phone frame. Decoding the 2x copy to read its size also
// warms it for the <img> on a 2x screen.
const STAGE_WIDTH = 320
// Width and height also go on the <img> (SEO patch v5 item 4); .mk-stage-pic sizes it either way.
export function stageImage(url: string): { src: string; srcSet: string | undefined; width: number; height: number } {
  const { props } = getImageProps({ src: url, alt: '', width: STAGE_WIDTH, height: STAGE_WIDTH })
  return { src: props.src, srcSet: props.srcSet, width: STAGE_WIDTH, height: STAGE_WIDTH }
}

// The cover on screen: the server's measured one at first (no layout shift), then, when the
// template changes, the old one stays until the new one is decoded and its shape known; the two
// change together, and the frame's height glides to the new shape (CSS). A cover that cannot be
// read is shown in the last known shape: contained, never cropped.
export function useStageCover(url: string | null, initial: StageCover | null): StageCover | null {
  const [shown, setShown] = useState<StageCover | null>(initial)
  useEffect(() => {
    if (!url || url === shown?.url) return
    let current = true
    naturalSize(stageImage(url).src)
      .then(({ width, height }) => current && setShown({ url, ratio: width / height }))
      .catch(() => current && setShown((previous) => ({ url, ratio: previous?.ratio ?? 4 / 5 })))
    return () => {
      current = false
    }
  }, [url, shown?.url])
  if (!url) return null
  return shown
}
