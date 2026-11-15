'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'

import type { PosterStudioState } from '../use-poster-studio'

// 标黄核对 (Owner 2026-11-15: users did not understand the bare checkbox): what was marked yellow
// and why, a 去核对 that walks through the yellow lines, and the box that has to be ticked before
// 生成 opens.
export function ReviewCheck({ studio }: { studio: PosterStudioState }) {
  const t = useTranslations('app.poster.review')
  const count = studio.draft.unverified.length
  return (
    <div className="grid gap-2 rounded-control bg-safelight-tint p-3 text-caption">
      <p>{t('explain', { count })}</p>
      <Button variant="outline" size="sm" className="min-h-11 justify-self-start" onClick={studio.review}>{t('go')}</Button>
      <label className="flex min-h-11 items-center gap-3 font-medium">
        <Checkbox checked={studio.draft.reviewed} onCheckedChange={(checked) => studio.setReviewed(checked === true)} />
        {t('confirm', { count })}
      </label>
    </div>
  )
}

// Next to 生成 when only the unticked box keeps it off.
export function ReviewNudge({ studio }: { studio: PosterStudioState }) {
  const t = useTranslations('app.poster.review')
  return (
    <div role="status" className="flex items-center gap-2 text-caption">
      <span className="flex-1 text-primary">{t('blocked', { count: studio.draft.unverified.length })}</span>
      <Button variant="outline" size="sm" className="min-h-11 shrink-0" onClick={studio.review}>{t('go')}</Button>
    </div>
  )
}
