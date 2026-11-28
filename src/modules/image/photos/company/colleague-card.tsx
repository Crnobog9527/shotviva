import { Download, X } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { PhotoItem } from '../photo-item'
import { orgFileUrl } from './company-items'

// The page's server action (the org owner's delete), by work id.
export type DeleteCompanyWork = (jobId: string) => Promise<{ failed: 'running' | 'error' } | undefined>

// Where the browser has the popover API the tile is a button that opens the panel; elsewhere it
// is a plain link to the picture. Chosen in CSS, so neither needs a script.
const WITH_POPOVER = 'hidden supports-[selector(:popover-open)]:block'
const WITHOUT_POPOVER = 'supports-[selector(:popover-open)]:hidden'

// A colleague's work on Photos' company view (ARCHITECTURE §6.5「作品页就是企业作品」): the same
// tile as the reader's own, opening a panel with the picture, who made it and when, and
// Download; the org's owner also gets Delete. It is not the reader's work, so there is no edit,
// Make again or share, and it is never picked for a share link.
// Server-rendered on purpose, with the browser's own popover and a plain form: nothing here is
// script, so the personal page (the same route) ships no code for it (scripts/js-budget.json).
// remove: the owner's delete action, null for staff.
export function ColleagueCard({ item, eager, remove }: { item: PhotoItem; eager: boolean; remove: DeleteCompanyWork | null }) {
  const t = useTranslations('app.photos')
  const panel = `colleague-${item.id}`
  const tile = (
    <span className="relative block aspect-[4/5] overflow-hidden rounded-inner bg-muted">
      {/* A signed R2 redirect per request, member-checked by the route: not a static asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.thumbUrl ?? undefined}
        alt={t('photoAlt', { name: item.templateName })}
        width={480}
        height={600}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={`${REPLAY_BLOCK_CLASS} absolute inset-0 size-full object-cover transition-transform duration-600 ease-house group-hover:scale-[1.03]`}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-linear-to-t from-(--photo-fade) to-transparent px-2.5 pt-10 pb-2 opacity-0 transition-opacity duration-250 ease-house group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:block"
      >
        <b className="block truncate text-caption font-semibold text-photo-ink">{item.templateName}</b>
        <small className="block truncate text-caption text-photo-ink/75">{makerName(item, t)}</small>
      </span>
    </span>
  )
  return (
    <div className="group relative">
      <button type="button" popoverTarget={panel} className={cn('press w-full rounded-inner text-left', WITH_POPOVER)}>
        {tile}
      </button>
      <a href={orgFileUrl(item.id)} target="_blank" rel="noopener" className={cn('press block rounded-inner', WITHOUT_POPOVER)}>
        {tile}
      </a>
      <ColleaguePanel id={panel} item={item} remove={remove} />
    </div>
  )
}

// The panel, in the top layer: closed by its own button, by Esc or by a press outside it. Its
// full picture is lazy, so nothing is fetched until the panel is opened.
function ColleaguePanel({ id, item, remove }: { id: string; item: PhotoItem; remove: DeleteCompanyWork | null }) {
  const t = useTranslations('app.photos')
  const format = useFormatter()
  const made = format.dateTime(new Date(item.createdAt), { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div
      id={id}
      popover="auto"
      aria-label={item.templateName}
      className="shadow-sheet m-auto max-h-[92dvh] w-[min(92vw,640px)] overflow-y-auto rounded-panel border-0 bg-popover p-5 text-foreground backdrop:bg-(--scrim) backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-headline font-semibold">{item.templateName}</p>
          <p className="mt-1 text-caption text-muted-foreground">{t('company.madeBy', { who: makerName(item, t), date: made })}</p>
        </div>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={t('company.close')} className="press -mt-1 -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-bone-dim hover:bg-wash hover:text-foreground">
          <X aria-hidden strokeWidth={1.75} className="size-5" />
        </button>
      </div>
      <div className="mt-4 overflow-hidden rounded-media bg-photo-ground">
        {/* The full file through the member-checked route (a signed redirect). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={orgFileUrl(item.id)} alt={t('photoAlt', { name: item.templateName })} loading="lazy" decoding="async" className={`${REPLAY_BLOCK_CLASS} mx-auto max-h-[58dvh] w-auto max-w-full object-contain`} />
      </div>
      <a href={orgFileUrl(item.id, '?download=1')} className={cn(buttonVariants({ variant: 'cta', size: 'cta' }), 'mt-5 flex items-center justify-center gap-2')}>
        <Download aria-hidden strokeWidth={2} className="size-[18px]" />
        {t('company.download')}
      </a>
      {remove ? <Remove action={remove.bind(null, item.id)} /> : <p className="mt-3 text-center text-caption text-muted-foreground">{t('company.viewOnly')}</p>}
    </div>
  )
}

// The owner's delete, in two steps without script: the first press opens the warning, the second
// submits the form to the server action (which checks ownership again and refreshes the list).
function Remove({ action }: { action: () => Promise<unknown> }) {
  const t = useTranslations('app.org.works.delete')
  // A server action bound to its work: the form posts to it as it is (what it returns is for a
  // scripted caller; here the list simply comes back without the work).
  const submit = action as unknown as (form: FormData) => Promise<void>
  return (
    <details className="group/remove mt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center text-label font-medium text-destructive [&::-webkit-details-marker]:hidden">{t('confirm')}</summary>
      <form action={submit} className="mt-2 rounded-control bg-wash p-4">
        <p className="text-label font-semibold">{t('title')}</p>
        <p className="mt-1 text-caption text-muted-foreground">{t('body')}</p>
        <button type="submit" className="mt-4 min-h-11 w-full rounded-button bg-destructive text-label font-semibold text-background">
          {t('confirm')}
        </button>
      </form>
    </details>
  )
}

type T = ReturnType<typeof useTranslations<'app.photos'>>

// "Li Lei", "Li Lei (left)", "Deleted member", or the plain word for an account with no label.
export function makerName(item: PhotoItem, t: T): string {
  const maker = item.maker
  if (!maker || maker.state === 'deleted') return t('company.deleted')
  const who = maker.who ?? t('company.unknown')
  return maker.state === 'removed' ? t('company.left', { who }) : who
}
