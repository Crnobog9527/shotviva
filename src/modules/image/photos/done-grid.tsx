/* eslint-disable @next/next/no-img-element -- auth-gated download route, not a static asset */
import Link from 'next/link'

import { WorkTag } from '../result/result-photo'
import { PhotosEmpty } from './photos-empty'
import { doneMeta, type PhotoItem } from './photo-item'

// "Done", newest first (B comp photos.html): two columns of finished photos with their pool's
// tag; each opens its result page. Empty state per DESIGN §4.6.
export function DoneGrid({ items, now, anyRunning }: { items: PhotoItem[]; now: Date; anyRunning: boolean }) {
  if (items.length === 0) return anyRunning ? null : <PhotosEmpty />
  return (
    <section aria-labelledby="done-h">
      <div className="mx-4 mt-6 mb-3 flex items-baseline justify-between gap-3">
        <h2 id="done-h" className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">Done</h2>
        <span className="text-caption text-muted-foreground">Newest first</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 md:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/photos/${item.id}`} className="press block rounded-control">
              <span className="hairline relative block aspect-[4/5] overflow-hidden rounded-control bg-card">
                {item.fileUrl ? <img src={item.fileUrl} alt={`${item.templateName} photo`} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" /> : null}
                <WorkTag pool={item.creditPool} visibility={item.visibility} className="absolute bottom-2 left-2" />
              </span>
              <b className="mt-2 block text-body font-semibold">{item.templateName}</b>
              <small className="mt-1 block text-caption leading-[1.35] text-muted-foreground">{doneMeta(item, now)}</small>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mx-4 mt-4 text-caption leading-[1.4] text-muted-foreground">
        Photos made with free credits are public with a watermark. Photos made with paid credits are private and watermark-free.
      </p>
    </section>
  )
}
