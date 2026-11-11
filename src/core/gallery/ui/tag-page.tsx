import { Link } from '../../i18n/ui'
import type { GalleryTag } from '../tags'
import type { GalleryWorkView } from '../work-view'
import { GalleryWall } from './gallery-wall'

type Props = { tag: GalleryTag; works: GalleryWorkView[]; related: GalleryTag[]; relatedLabel: string }

// The five parts of a tag page (创作库规格 U7): the direct answer, the body, the grid (alt from
// the template and the dish or product text), the way to make one, the related tags.
export function TagPage({ tag, works, related, relatedLabel }: Props) {
  const tiles = works.map((work) => ({ id: work.id, alt: [work.copy[0]?.value, work.templateName, tag.keyword].filter(Boolean).join(' · ') }))
  return (
    <article className="mk-w grid gap-6 px-[var(--gutter)] py-8 md:py-12">
      <header className="grid max-w-2xl gap-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{tag.h1}</h1>
        <p className="text-lg">{tag.answer}</p>
      </header>
      {tiles.length > 0 ? <GalleryWall tiles={tiles} label={tag.h1} /> : null}
      <Link href={`/generate/${encodeURIComponent(tag.ctaTemplateId)}`} prefetch={false} className="mk-cta justify-self-center sm:w-auto sm:px-8">
        {tag.ctaLabel}
      </Link>
      <div className="grid max-w-2xl gap-4 text-[var(--muted-foreground)]">
        {tag.body.map((paragraph) => (
          <p key={paragraph.slice(0, 32)}>{paragraph}</p>
        ))}
      </div>
      {related.length > 0 ? (
        <nav aria-label={relatedLabel} className="flex flex-wrap gap-2">
          {related.map((other) => (
            <Link key={other.slug} href={`/tag/${other.slug}`} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm">
              {other.h1}
            </Link>
          ))}
        </nav>
      ) : null}
    </article>
  )
}
