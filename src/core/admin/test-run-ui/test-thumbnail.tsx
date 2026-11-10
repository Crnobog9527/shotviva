'use client'

import { displaySource, onThumbnailError, onThumbnailLoad } from './thumbnail-fallback'

type Props = {
  id: string
  kind: 'photo' | 'run'
  src: string
  originalUrl?: string | null
  thumbnailMissing?: boolean
  alt: string
  className: string
  lazy?: boolean
}

export function TestThumbnail({ alt, className, lazy, ...source }: Props) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={displaySource(source)} alt={alt} className={className} loading={lazy ? 'lazy' : undefined}
    onLoad={event => onThumbnailLoad(event.currentTarget, source)} onError={event => onThumbnailError(event.currentTarget, source)} />
}
