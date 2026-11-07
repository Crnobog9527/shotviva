/* eslint-disable @next/next/no-img-element -- auth-gated download route, not a static asset */
import { useTranslations } from 'next-intl'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import type { OriginalSource } from './photo-detail'

// The "Original" view, laid over the result so the frame keeps the result's size: the 768px
// preview of the upload, whole (never cropped), or the empty tray once it is gone (T32).
export function OriginalLayer({ source, alt }: { source: OriginalSource; alt: string }) {
  const t = useTranslations('app.result')
  if (source.kind !== 'deleted') {
    return <img src={source.url} alt={alt} decoding="async" className={`${REPLAY_BLOCK_CLASS} absolute inset-0 size-full bg-photo-ground object-contain`} />
  }
  return (
    <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-card p-6 text-center">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
        <path d="M3.5 15l4.5-4.5 4.5 4.5 2.5-2.5 5.5 5.5" />
        <circle cx="15.5" cy="9" r="1.5" />
        <path d="M4 4l16 16" />
      </svg>
      <b className="text-body leading-[1.3] font-semibold">{t('originalDeleted')}</b>
      <span className="max-w-[28ch] text-caption leading-[1.4] text-muted-foreground">{t('originalDeletedBody')}</span>
    </div>
  )
}
