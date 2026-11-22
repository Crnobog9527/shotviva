'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'
import { Switch } from '@/core/ui/switch'

import { LinkShareButtons } from '../share/link-share-buttons'
import { SHARE_NOTE_MAX, SHARE_TITLE_MAX, type CreateShareAction } from './share-types'
import { useCreateShare, type CreateState } from './use-create-share'

type Props = { open: boolean; onOpenChange(open: boolean): void; jobIds: readonly string[]; create: CreateShareAction; onDone(): void }

const FIELD = 'w-full rounded-control bg-wash px-3.5 py-3 text-body text-foreground shadow-[inset_0_0_0_1px_var(--input)] outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_0_0_1.5px_var(--ring)]'

// The link dialog: an optional title and note, the per-link "show my originals" choice (off by
// default, ARCHITECTURE §6.2「作品集分享」), then the finished link to copy or share.
export function CreateShareSheet({ open, onOpenChange, jobIds, create, onDone }: Props) {
  const t = useTranslations('app.workShare')
  const share = useCreateShare(create)
  const close = (next: boolean) => {
    onOpenChange(next)
    if (next) return
    if (share.state.kind === 'ready') onDone()
    share.reset()
  }
  const ready = share.state.kind === 'ready'
  return (
    <ResponsiveSheet open={open} onOpenChange={close} title={ready ? t('readyTitle') : t('title')} description={ready ? t('readyText') : t('lede', { count: jobIds.length })}>
      {share.state.kind === 'ready' ? (
        <ShareReady url={share.state.url} onDone={() => close(false)} />
      ) : (
        <ShareForm state={share.state} pending={share.pending} onSubmit={(fields) => share.submit({ jobIds: [...jobIds], ...fields })} />
      )}
    </ResponsiveSheet>
  )
}

const ERROR_KEY = { gone: 'errorGone', busy: 'errorBusy', error: 'errorOther' } as const

type Fields = { title: string; note: string; showBefore: boolean }

function ShareForm({ state, pending, onSubmit }: { state: CreateState; pending: boolean; onSubmit(fields: Fields): void }) {
  const t = useTranslations('app.workShare')
  const [fields, setFields] = useState<Fields>({ title: '', note: '', showBefore: false })
  const error = state.kind === 'failed' ? t(ERROR_KEY[state.reason]) : null
  return (
    <form
      className="mt-5 grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(fields)
      }}
    >
      <label className="grid gap-2">
        <span className="text-label font-medium">{t('titleLabel')} <span className="font-normal text-muted-foreground">{t('optional')}</span></span>
        <input value={fields.title} maxLength={SHARE_TITLE_MAX} placeholder={t('titlePlaceholder')} onChange={(event) => setFields({ ...fields, title: event.target.value })} className={FIELD} />
      </label>
      <label className="grid gap-2">
        <span className="text-label font-medium">{t('noteLabel')} <span className="font-normal text-muted-foreground">{t('optional')}</span></span>
        <textarea value={fields.note} maxLength={SHARE_NOTE_MAX} rows={3} placeholder={t('notePlaceholder')} onChange={(event) => setFields({ ...fields, note: event.target.value })} className={`${FIELD} resize-none`} />
      </label>
      <label className="hairline flex items-start justify-between gap-4 rounded-panel bg-card p-4">
        <span className="grid gap-1">
          <span className="text-label font-medium">{t('beforeLabel')}</span>
          <span className="text-caption text-muted-foreground">{t('beforeHint')}</span>
        </span>
        <Switch checked={fields.showBefore} onCheckedChange={(showBefore) => setFields({ ...fields, showBefore })} className="mt-1" />
      </label>
      {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
      <Button type="submit" variant="cta" size="cta" disabled={pending}>
        {pending ? t('creating') : t('create')}
      </Button>
    </form>
  )
}

function ShareReady({ url, onDone }: { url: string; onDone(): void }) {
  const t = useTranslations('app.workShare')
  const labels = { copy: t('copy'), copied: t('copied'), share: t('shareLink'), copiedHint: t('copiedHint'), copyByHand: t('copyByHand') }
  return (
    <div className="mt-5 grid gap-4">
      <p className="hairline rounded-control bg-wash px-3.5 py-3 font-mono text-caption break-all select-all">{url}</p>
      <LinkShareButtons url={url} title={t('shareTitle')} text={t('shareTitle')} labels={labels} />
      <Button variant="cta" size="cta" onClick={onDone}>
        {t('done')}
      </Button>
    </div>
  )
}
