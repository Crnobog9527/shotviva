import { Link } from '../../i18n/ui'

type Props = { page: number; hasNext: boolean; text: { label: string; previous: string; next: string; page: string } }

const href = (page: number) => (page <= 1 ? '/gallery' : `/gallery?page=${page}`)

// Real links to the neighbouring pages only (创作库规格 U11): no infinite scroll, at most 20 pages.
export function GalleryPager({ page, hasNext, text }: Props) {
  if (page <= 1 && !hasNext) return null
  return (
    <nav aria-label={text.label} className="flex items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className="underline underline-offset-4">
          {text.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-[var(--muted-foreground)]">{text.page}</span>
      {hasNext ? (
        <Link href={href(page + 1)} rel="next" className="underline underline-offset-4">
          {text.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
