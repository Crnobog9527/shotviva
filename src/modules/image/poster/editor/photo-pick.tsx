'use client'

import { Camera } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import { Button } from '@/core/ui/button'

import { ConfirmRow } from '../../again/confirm-row'
import type { PhotoSort } from '../use-photo-sort'
import { SortProgress } from './sort-progress'

const ACCEPT = 'image/jpeg,image/png,image/webp'

// 拍照识别 on the paste step (§5.3「每周复用」): a photo or screenshot of last week's poster
// instead of the notice text. While it is read the same progress as 整理内容 shows.
export function PhotoPick({ photo }: { photo: PhotoSort }) {
  const t = useTranslations('app.weekly.photo')
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="grid gap-2 rounded-control bg-wash-faint p-3 text-caption">
      <p className="text-muted-foreground">{t('hint')}</p>
      <input ref={input} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden
        onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; if (files.length) void photo.pick(files) }} />
      <Button variant="outline" size="sm" className="min-h-11 justify-self-start" disabled={photo.busy} onClick={() => input.current?.click()}>
        <Camera aria-hidden className="size-4" />{photo.phase === 'uploading' ? t('uploading') : t('pick')}
      </Button>
      {photo.phase === 'reading' ? <SortProgress stage={photo.stage} reading={t('reading')} /> : null}
      {photo.error ? <p role="alert" className="text-destructive">{t(`error.${photo.error}`)}</p> : null}
      {photo.pending ? <ConfirmRow text={t('replaceAsk')} yes={t('replace')} no={t('keep')} onYes={photo.confirm} onNo={photo.discard} /> : null}
    </div>
  )
}
