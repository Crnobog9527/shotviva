import { COPY } from './copy'

// Thumbnails link to the full image in a new tab: the Owner judges content and copyright
// from the original, not a crop. Signed URLs expire after an hour; reloading refreshes them.
export function RequestImages({ urls }: { urls: readonly string[] }) {
  if (urls.length === 0) return <span className="text-muted-foreground text-xs">{COPY.noImages}</span>
  return (
    <div className="flex gap-2">
      {urls.map((url, index) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded border">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URLs, not optimisable */}
          <img src={url} alt={COPY.imageAlt(index + 1)} className="size-full object-cover" />
        </a>
      ))}
    </div>
  )
}
