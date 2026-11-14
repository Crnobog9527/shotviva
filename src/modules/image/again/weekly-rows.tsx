'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Link } from '@/core/i18n/ui'
import { Button } from '@/core/ui/button'

import { ConfirmRow } from './confirm-row'
import { ShortDay } from './short-day'

// 每周复用's two rows at the top of an editor (§5.3): 用上一期, and the store details. Shared by the
// poster editor and the creation dialog; each passes its own state.

const box = 'grid gap-2 rounded-control bg-wash-faint p-3 text-caption'

type Work = { madeAt: string; templateId: string }
// missing: the names of photo boxes whose photo from that issue is gone.
type Reused = Work & { missing: readonly string[] }
export type LastRowProps = {
  last: Work | null
  reused: Reused | null
  busy: boolean
  failed: boolean
  dirty(): boolean
  onTake(): void
  names: Record<string, string>
}

export function LastRow({ last, reused, busy, failed, dirty, onTake, names }: LastRowProps) {
  const t = useTranslations('app.weekly')
  const [asking, setAsking] = useState(false)
  if (reused) {
    return (
      <div role="status" className={box}>
        <p>{t.rich('reused', { day: () => <ShortDay iso={reused.madeAt} />, name: names[reused.templateId] ?? '' })}</p>
        {reused.missing.length ? <p className="text-destructive">{t('photosGone', { boxes: reused.missing.join('、') })}</p> : null}
      </div>
    )
  }
  if (!last) return null
  const go = () => { setAsking(false); onTake() }
  return (
    <div className={box}>
      {asking ? <ConfirmRow text={t('replaceAsk')} yes={t('replace')} no={t('cancel')} onYes={go} onNo={() => setAsking(false)} /> : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={() => (dirty() ? setAsking(true) : go())}>
            {busy ? t('lastLoading') : t('useLast')}
          </Button>
          <span className="text-muted-foreground">{t.rich('lastFrom', { day: () => <ShortDay iso={last.madeAt} />, name: names[last.templateId] ?? '' })}</span>
        </div>
      )}
      {failed ? <p role="alert" className="text-destructive">{t('lastFailed')}</p> : null}
    </div>
  )
}

export type StoreRowProps = {
  // null: no store details saved yet; a link to save them.
  store: object | null
  filled: boolean
  autofill: boolean
  conflicts(): boolean
  onFill(): void
  onUndo(): void
  onAutofillOff(): void
}

export function StoreRow({ store, filled, autofill, conflicts, onFill, onUndo, onAutofillOff }: StoreRowProps) {
  const t = useTranslations('app.weekly')
  const [asking, setAsking] = useState(false)
  if (!store) return <p className="px-1 text-caption text-muted-foreground"><Link href="/account?store=1" className="underline underline-offset-3">{t('saveStore')}</Link></p>
  if (filled) {
    return (
      <div role="status" className={box}>
        <p>{t('storeFilled')}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" className="min-h-11" onClick={onUndo}>{t('undo')}</Button>
          {autofill ? <Button size="sm" variant="ghost" className="min-h-11" onClick={onAutofillOff}>{t('autofillOff')}</Button> : null}
        </div>
      </div>
    )
  }
  const go = () => { setAsking(false); onFill() }
  return (
    <div className={box}>
      {asking ? <ConfirmRow text={t('storeReplaceAsk')} yes={t('replace')} no={t('cancel')} onYes={go} onNo={() => setAsking(false)} />
        : <Button variant="outline" size="sm" className="min-h-11 justify-self-start" onClick={() => (conflicts() ? setAsking(true) : go())}>{t('fillStore')}</Button>}
    </div>
  )
}
