import { categorySlug } from '../../analytics/event-values'
import { Link } from '../../i18n/ui'
import { galleryImagePath } from '../image'
import type { GalleryWorkView } from '../work-view'
import { ReportButton } from './report-button'
import { GalleryViewEvent, ReuseLink } from './track'
import type { ReportText } from './use-report'

export type WorkPageText = {
  back: string
  template: string
  text: string
  reuse: string
  reuseNote: string
  watermark: string
  alt: string
}

type Props = { work: GalleryWorkView; text: WorkPageText; report: ReportText; loginHref: string }

// Where 「一键复用」 goes (ARCHITECTURE §9 第 3 条): the template with this work's settings, never
// its photo. The workspace checks the work again before using anything from it.
export const reuseHref = (work: Pick<GalleryWorkView, 'id' | 'templateId'>) =>
  `/generate/${encodeURIComponent(work.templateId)}?reuse=${encodeURIComponent(work.id)}`

function Facts({ work, text }: Pick<Props, 'work' | 'text'>) {
  return (
    <dl className="grid gap-3 text-sm">
      <div>
        <dt className="text-[var(--muted-foreground)]">{text.template}</dt>
        <dd className="text-base font-medium">{work.templateName}</dd>
      </div>
      {work.copy.length > 0 ? (
        <div>
          <dt className="text-[var(--muted-foreground)]">{text.text}</dt>
          {work.copy.map((field) => (
            <dd key={field.label} className="break-words">
              {`${field.label}: ${field.value}`}
            </dd>
          ))}
        </div>
      ) : null}
    </dl>
  )
}

// /g/[id]: the work as the gallery shows it (watermarked like the download), what it was made
// with, and the way to make one like it. Always noindex (创作库规格 U1).
export function WorkPage({ work, text, report, loginHref }: Props) {
  return (
    <article className="mk-w grid gap-6 px-[var(--gutter)] py-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start md:gap-10 md:py-12">
      <div className="overflow-hidden rounded-[var(--radius-tile)] bg-[var(--wash)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own route already sizes and encodes it */}
        <img
          src={galleryImagePath(work.id, 960)}
          srcSet={`${galleryImagePath(work.id, 480)} 480w, ${galleryImagePath(work.id, 960)} 960w`}
          sizes="(min-width: 768px) 60vw, 100vw"
          alt={text.alt}
          width={960}
          height={960}
          fetchPriority="high"
          className="mx-auto max-h-[80vh] w-full object-contain"
        />
      </div>
      <div className="grid gap-5">
        <Link href="/gallery" className="text-sm underline underline-offset-4">
          {text.back}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{work.templateName}</h1>
        <Facts work={work} text={text} />
        <div className="grid gap-2">
          <ReuseLink href={reuseHref(work)} className="mk-cta" event={{ template_id: work.templateId, surface: 'work' }}>
            {text.reuse}
          </ReuseLink>
          <p className="text-sm text-[var(--muted-foreground)]">{text.reuseNote}</p>
        </div>
        {work.watermarked ? <p className="text-xs text-[var(--muted-foreground)]">{text.watermark}</p> : null}
        <div>
          <ReportButton jobId={work.id} loginHref={loginHref} text={report} />
        </div>
      </div>
      <GalleryViewEvent event="gallery_work_view" props={{ template_id: work.templateId, category: categorySlug(work.category) }} />
    </article>
  )
}
