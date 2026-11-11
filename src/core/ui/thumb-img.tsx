'use client'

/* eslint-disable @next/next/no-img-element -- a signed R2 URL or the auth-gated thumbnail route, not a static asset */
import { useCallback, useState, type ComponentProps } from 'react'

// A work's small picture whose `src` may be a signed URL written into the page: those expire in
// minutes, so a page restored later (back / forward) can hold a dead one. When it fails, the
// picture is asked for once more from `fallback` (the thumbnail route, which signs afresh). The
// ref catches an image that already failed before hydration, when onError never fires.
export function ThumbImg({ src, fallback, alt, ...img }: Omit<ComponentProps<'img'>, 'src' | 'onError' | 'ref'> & { src: string; fallback: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  const ref = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setFailed(true)
  }, [])
  return <img {...img} alt={alt} ref={ref} src={failed ? fallback : src} onError={() => setFailed(true)} />
}
