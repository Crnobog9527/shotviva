'use client'

/* eslint-disable @next/next/no-img-element -- the owner's own thumbnail route */
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { cn } from '@/core/ui/cn'

export type OwnShareRow = { id: string; title: string | null; meta: string; path: string; thumbUrl: string | null; revoked: boolean }
export type RevokeShareAction = (shareId: string) => Promise<{ ok: boolean }>

// "Share links" (ARCHITECTURE §6.2「作品集分享」): each link the owner made, newest first, with its
// first work's small copy, open, and turn off. Turning off asks once and cannot be undone.
export function OwnShares({ rows, revoke }: { rows: OwnShareRow[]; revoke: RevokeShareAction }) {
  const t = useTranslations('app.workShare')
  if (rows.length === 0) return <p className="mx-(--gutter) mt-6 text-label text-muted-foreground">{t('listEmpty')}</p>
  return (
    <ul className="hairline mx-(--gutter) mt-6 divide-y divide-hairline overflow-hidden rounded-panel bg-card">
      {rows.map((row) => (
        <ShareRow key={row.id} row={row} revoke={revoke} />
      ))}
    </ul>
  )
}

function ShareRow({ row, revoke }: { row: OwnShareRow; revoke: RevokeShareAction }) {
  const t = useTranslations('app.workShare')
  const [revoked, setRevoked] = useState(row.revoked)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()
  const turnOff = () => {
    if (!window.confirm(t('revokeConfirm'))) return
    start(async () => {
      const result = await revoke(row.id).catch(() => ({ ok: false }))
      setFailed(!result.ok)
      if (result.ok) setRevoked(true)
    })
  }
  return (
    <li className="flex items-center gap-3 p-3">
      <span className="hairline relative block size-14 shrink-0 overflow-hidden rounded-inner bg-muted">
        {row.thumbUrl ? <img src={row.thumbUrl} alt="" width={56} height={56} loading="lazy" className={cn('size-full object-cover', revoked && 'opacity-40')} /> : null}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="truncate text-body font-semibold">{row.title ?? t('untitled')}</b>
        <small className="text-caption text-muted-foreground">{row.meta}</small>
        <small className={cn('text-caption', revoked ? 'text-muted-foreground' : 'text-success')}>{revoked ? t('revoked') : t('live')}</small>
        {failed ? <small role="alert" className="text-caption text-destructive">{t('revokeFailed')}</small> : null}
      </span>
      {revoked ? null : (
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <a href={row.path} target="_blank" rel="noopener" className="press hairline inline-flex min-h-9 items-center rounded-full bg-wash px-3.5 text-caption font-medium">
            {t('open')}
          </a>
          <button type="button" disabled={pending} onClick={turnOff} className="inline-flex min-h-9 items-center px-1 text-caption font-medium text-destructive disabled:opacity-60">
            {t('revoke')}
          </button>
        </span>
      )}
    </li>
  )
}
