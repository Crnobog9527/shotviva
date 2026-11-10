'use client'

type Props = { id: string; kind: 'photo'|'run'; src: string; alt: string; className: string; lazy?: boolean }

export function TestThumbnail({ id,kind,src,alt,className,lazy }: Props) {
  const fallback = `/api/admin/test-thumbnail?kind=${kind}&id=${encodeURIComponent(id)}`
  // Historical originals predate WebP derivatives. An authenticated lookup can build one.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={lazy ? 'lazy' : undefined} onError={event => {
    if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback
  }} />
}
