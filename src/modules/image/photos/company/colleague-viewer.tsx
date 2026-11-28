'use client'

import { Download } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import type { PhotoItem } from '../photo-item'
import { makerName } from './colleague-card'
import { orgFileUrl } from './company-items'

// The page's server action (the org owner's delete), by work id.
export type DeleteCompanyWork = (jobId: string) => Promise<{ failed: 'running' | 'error' } | undefined>

type Props = { item: PhotoItem; open: boolean; onOpenChange(open: boolean): void; remove: DeleteCompanyWork | null }

// A colleague's work, opened from Photos' company view (ARCHITECTURE §6.5): the picture, what it
// is, who made it and when, and Download. The org's owner also gets Delete, behind a second step
// that says it cannot be undone; the action checks ownership again on the server.
export function ColleagueViewer({ item, open, onOpenChange, remove }: Props) {
  const t = useTranslations('app.photos')
  const format = useFormatter()
  const made = format.dateTime(new Date(item.createdAt), { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={item.templateName} description={t('company.madeBy', { who: makerName(item, t), date: made })} wide>
      <div className="mt-4 overflow-hidden rounded-media bg-photo-ground">
        {/* The full file through the member-checked route (a signed redirect): never cached as an asset. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={orgFileUrl(item.id)} alt={t('photoAlt', { name: item.templateName })} className={`${REPLAY_BLOCK_CLASS} mx-auto max-h-[62dvh] w-auto max-w-full object-contain`} />
      </div>
      <a href={orgFileUrl(item.id, '?download=1')} className={cn(buttonVariants({ variant: 'cta', size: 'cta' }), 'mt-5 gap-2')}>
        <Download aria-hidden strokeWidth={2} className="size-[18px]" />
        {t('company.download')}
      </a>
      {remove ? <Remove id={item.id} remove={remove} onDone={() => onOpenChange(false)} /> : <p className="mt-3 text-center text-caption text-muted-foreground">{t('company.viewOnly')}</p>}
    </ResponsiveSheet>
  )
}

// Delete in two steps, in place: the first press asks, the second deletes.
function Remove({ id, remove, onDone }: { id: string; remove: DeleteCompanyWork; onDone(): void }) {
  const t = useTranslations('app.org.works.delete')
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState<'running' | 'error' | null>(null)
  const [pending, start] = useTransition()
  const confirm = () =>
    start(async () => {
      const result = await remove(id)
      if (result) setFailed(result.failed)
      else onDone()
    })
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="mt-2 min-h-11 w-full text-label font-medium text-destructive">
        {t('confirm')}
      </button>
    )
  }
  return (
    <div className="mt-4 rounded-control bg-wash p-4">
      <p className="text-label font-semibold">{t('title')}</p>
      <p className="mt-1 text-caption text-muted-foreground">{t('body')}</p>
      {failed ? <p role="alert" className="mt-3 text-caption text-destructive">{t(failed)}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={() => setAsking(false)} className="min-h-11 rounded-button bg-wash text-label font-medium">
          {t('cancel')}
        </button>
        <button type="button" disabled={pending} onClick={confirm} className="min-h-11 rounded-button bg-destructive text-label font-semibold text-background">
          {t(pending ? 'deleting' : 'confirm')}
        </button>
      </div>
    </div>
  )
}
