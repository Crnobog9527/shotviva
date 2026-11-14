'use client'

import { Camera } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import type { Balance } from '@/core/billing/pools'
import { Link } from '@/core/i18n/ui'
import { Button } from '@/core/ui/button'

import { ConfirmRow } from '../../again/confirm-row'
import { canAfford } from '../../workspace/cta-state'
import type { PhotoSort } from '../use-photo-sort'
import { SortProgress } from './sort-progress'

const ACCEPT = 'image/jpeg,image/png,image/webp'

// 拍照识别 on the paste step (§5.3「每周复用」): a photo or screenshot of last week's poster
// instead of the notice text. While it is read the same progress as 整理内容 shows.
// credits: the run's price from the server (1521); a balance that cannot cover it shows why, with
// the way to more credits, instead of a button that would be refused.
export function PhotoPick({ photo, credits, balance }: { photo: PhotoSort; credits: number; balance: Balance }) {
  const t = useTranslations('app.weekly.photo')
  const input = useRef<HTMLInputElement>(null)
  const afford = canAfford(balance, credits)
  return (
    <div className="grid gap-2 rounded-control bg-wash-faint p-3 text-caption">
      <p className="text-muted-foreground">{t('hint')}</p>
      <input ref={input} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden
        onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; if (files.length) void photo.pick(files) }} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="outline" size="sm" className="min-h-11" disabled={photo.busy || !afford} onClick={() => input.current?.click()}>
          <Camera aria-hidden className="size-4" />{photo.phase === 'uploading' ? t('uploading') : t('pick')}
        </Button>
        <span className="text-muted-foreground">{t('cost', { credits })}</span>
      </div>
      {afford ? null : <p role="status" className="text-primary">{t('notEnough', { credits })} <Link href="/pricing" className="underline underline-offset-3">{t('getCredits')}</Link></p>}
      {photo.phase === 'reading' ? <SortProgress stage={photo.stage} reading={t('reading')} /> : null}
      {photo.error ? <p role="alert" className="text-destructive">{t(`error.${photo.error}`, { credits })}</p> : null}
      {photo.pending ? <ConfirmRow text={t('replaceAsk')} yes={t('replace')} no={t('keep')} onYes={photo.confirm} onNo={photo.discard} /> : null}
    </div>
  )
}
