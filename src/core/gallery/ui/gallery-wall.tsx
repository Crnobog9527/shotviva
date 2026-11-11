import { Link } from '../../i18n/ui'
import { galleryImagePath } from '../image'

export type WallTile = { id: string; alt: string }

// The wall (ARCHITECTURE §9 第 9 条): square tiles, 2 across on a 375px phone, more on wider
// screens. The first row loads eagerly (it is the LCP); the rest lazily. Plain links, no script.
export function GalleryWall({ tiles, label }: { tiles: WallTile[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
      {tiles.map((tile, index) => (
        <li key={tile.id} className="overflow-hidden rounded-[var(--radius-tile)] bg-[var(--wash)]">
          <Link href={`/g/${tile.id}`} prefetch={false} className="block aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element -- our own route already sizes and encodes it */}
            <img
              src={galleryImagePath(tile.id, 480)}
              alt={tile.alt}
              width={480}
              height={480}
              loading={index < 4 ? 'eager' : 'lazy'}
              fetchPriority={index < 2 ? 'high' : 'auto'}
              decoding="async"
              className="size-full object-cover"
            />
          </Link>
        </li>
      ))}
    </ul>
  )
}
