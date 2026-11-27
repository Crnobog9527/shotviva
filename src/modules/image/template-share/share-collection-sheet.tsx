'use client'

import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { TEMPLATE_SHARE_NOTE_MAX, TEMPLATE_SHARE_TITLE_MAX, type TemplateShareItem } from '@/core/template-shares/rules'
import { Button } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { fieldClass, reveal } from '../workspace/copy-field-input'
import { ShareLinkActions } from './share-link-actions'
import { useCreateShare } from './use-create-share'

type Props = { open: boolean; items: readonly TemplateShareItem[]; onClose(): void; onDone(): void }

// "Share selected (N)": an optional title and note for the client, then one link (ARCHITECTURE
// §5.1g) to send by the phone's share sheet or copy. Closing before the link is made keeps the
// picks; once it is made, Done ends share mode.
export function ShareCollectionSheet({ open, items, onClose, onDone }: Props) {
  const t = useTranslations('app.templateShare')
  const { state, create, reset } = useCreateShare()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const ids = { title: useId(), note: useId() }
  const finish = () => {
    reset()
    setTitle('')
    setNote('')
    onDone()
  }
  const close = (next: boolean) => {
    if (next) return
    if (state.status === 'done') return finish()
    if (state.status !== 'sending') reset()
    onClose()
  }
  return (
    <ResponsiveSheet open={open} onOpenChange={close} title={state.status === 'done' ? t('readyTitle') : t('sheetTitle')} description={state.status === 'done' ? t('readyText') : t('sheetText', { count: items.length })}>
      {state.status === 'done' ? (
        <div className="grid gap-3 pt-4 pb-2">
          <ShareLinkActions url={state.url} title={title.trim() || t('defaultTitle')} />
          <Button variant="cta" size="cta" onClick={finish}>{t('done')}</Button>
        </div>
      ) : (
        <form className="grid gap-4 pt-4 pb-2" onSubmit={(event) => { event.preventDefault(); void create(items, title, note) }}>
          <label htmlFor={ids.title} className="grid gap-2 text-label font-medium">
            <span>{t('titleLabel')} <span className="font-normal text-muted-foreground">{t('optional')}</span></span>
            <input id={ids.title} value={title} maxLength={TEMPLATE_SHARE_TITLE_MAX} placeholder={t('titlePlaceholder')} onFocus={reveal}
              onChange={(event) => setTitle(event.target.value)} autoComplete="off" enterKeyHint="next" className={`${fieldClass} h-13 py-0`} />
          </label>
          <label htmlFor={ids.note} className="grid gap-2 text-label font-medium">
            <span>{t('noteLabel')} <span className="font-normal text-muted-foreground">{t('optional')}</span></span>
            <textarea id={ids.note} value={note} rows={3} maxLength={TEMPLATE_SHARE_NOTE_MAX} placeholder={t('notePlaceholder')} onFocus={reveal}
              onChange={(event) => setNote(event.target.value)} className={`${fieldClass} min-h-[96px]`} />
          </label>
          {state.status === 'error' ? <p role="alert" className="text-caption text-destructive">{t(`error.${state.error}`)}</p> : null}
          <Button type="submit" variant="cta" size="cta" disabled={state.status === 'sending' || items.length === 0}>
            {state.status === 'sending' ? t('creating') : t('create')}
          </Button>
        </form>
      )}
    </ResponsiveSheet>
  )
}
