import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { Link } from '@/core/i18n/ui'
import { Reveal } from '@/core/ui/reveal-item'
import { useFormatter, useTranslations } from 'next-intl'

import { makeAgainHref } from '../again/again-start'
import { GroundedImg } from '../result/grounded-img'
import { WorkTag } from '../result/work-tag'
import { PhotosEmpty } from './photos-empty'
import { doneMeta, type PhotoItem } from './photo-item'

// "Done", newest first (B comp photos.html): finished photos with their pool's tag, two columns
// on phones, three from md, four from lg. Each opens its result page; below it a quiet
// "Make again" goes to the template's workspace when the template is still in the catalogue
// (an edit or a retired template has none). Empty state per DESIGN §4.6.
export function DoneGrid({ items, now, anyRunning, liveTemplates }: { items: PhotoItem[]; now: Date; anyRunning: boolean; liveTemplates: string[] }) {
  const t = useTranslations('app')
  const format = useFormatter()
  const day = (date: Date) => format.dateTime(date, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  if (items.length === 0) return anyRunning ? null : <PhotosEmpty />
  return (
    <section aria-labelledby="done-h">
      <div className="mx-(--gutter) mt-6 mb-3 flex items-baseline justify-between gap-3 md:mt-8">
        <h2 id="done-h" className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('photos.done')}</h2>
        <span className="text-caption text-muted-foreground">{t('photos.newest')}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-4 px-(--gutter) md:grid-cols-3 md:gap-x-4 md:gap-y-6 lg:grid-cols-4">
        {items.map((item) => (
          <Reveal as="li" key={item.id}>
            <div className="flex h-full flex-col transition-transform duration-250 ease-house hover:-translate-y-0.5">
              <Link href={`/photos/${item.id}`} className="group press block rounded-control">
                <span className="hairline relative block aspect-[4/5] overflow-hidden rounded-control bg-muted transition-shadow group-hover:shadow-[inset_0_0_0_1px_var(--input)]">
                  {item.fileUrl ? <GroundedImg ground="white" src={item.fileUrl} alt={t('photos.photoAlt', { name: item.templateName })} loading="lazy" decoding="async" className={`${REPLAY_BLOCK_CLASS} absolute inset-0 size-full object-cover transition-transform duration-600 ease-house group-hover:scale-[1.02]`} /> : null}
                  <WorkTag pool={item.creditPool} visibility={item.visibility} className="absolute bottom-2 left-2" />
                </span>
                <b className="mt-2 block text-body font-semibold">{item.templateName}</b>
                <small className="mt-1 block text-caption leading-[1.35] text-muted-foreground">{doneMeta(item, now, t, day)}</small>
              </Link>
              {liveTemplates.includes(item.templateId) ? <MakeAgain templateId={item.templateId} jobId={item.id} /> : null}
            </div>
          </Reveal>
        ))}
      </ul>
      <p className="mx-(--gutter) mt-4 max-w-[72ch] text-caption leading-[1.4] text-muted-foreground">{t('photos.footnote')}</p>
    </section>
  )
}

// "Make again ›": the template's workspace page, the full-page form (DESIGN §6.9 item 2), opened
// from this work like the photo page's Make again: its settings and its kept photo (T40). No
// prefetch: opening it copies the kept photo back to a fresh upload.
function MakeAgain({ templateId, jobId }: { templateId: string; jobId: string }) {
  const t = useTranslations('app.photos')
  return (
    <Link href={makeAgainHref(templateId, jobId)} prefetch={false} className="mt-1 inline-flex min-h-9 items-center gap-0.5 self-start text-caption font-medium text-foreground hover:underline hover:underline-offset-3">
      {t('makeAgain')}
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}
