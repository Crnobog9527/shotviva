import { REPLAY_BLOCK_CLASS } from '../../analytics/browser'
import type { TicketImage } from '../types'

// A message's images (T69): small squares in the card; each opens the full image (a short-lived
// signed URL) in a new tab. width / height keep the space reserved while they load.
// openLabel: the link's accessible name, "Open image 2" (the admin page passes its Chinese).
export function MessageImages({ images, openLabel }: { images: readonly TicketImage[]; openLabel(n: number): string }) {
  if (images.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2 pt-1">
      {images.map((image, index) => (
        <li key={image.id}>
          <a
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={openLabel(index + 1)}
            className="press block overflow-hidden rounded-inner shadow-[inset_0_0_0_1px_var(--border)]"
          >
            {/* A private, signed R2 URL that expires: nothing for next/image to cache. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt="" width={image.width} height={image.height} loading="lazy" decoding="async" className={`${REPLAY_BLOCK_CLASS} size-24 object-cover`} />
          </a>
        </li>
      ))}
    </ul>
  )
}
