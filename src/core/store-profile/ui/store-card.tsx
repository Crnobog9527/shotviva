'use client'

import { ChevronDown, Store } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Group } from '../../account/ui/rows'
import type { StoreActions } from '../profile'
import { StoreFields } from './store-fields'
import { uploadStoreQr, useStoreForm } from './use-store-form'

// 店铺信息 on /account (§5.3「每周复用」): typed once, filled into poster templates with matching
// fields. Read when opened; ?store=1 (the editors' 「保存店铺信息」 link) opens it at once.
export function StoreCard({ actions }: { actions: StoreActions }) {
  const t = useTranslations('app.weekly.storeCard')
  const asked = useSearchParams().get('store') === '1'
  const [open, setOpen] = useState(false)
  const form = useStoreForm(actions, uploadStoreQr)
  const toggle = () => {
    if (!open && !form.text) form.load()
    setOpen(!open)
  }
  useEffect(() => {
    if (!asked) return
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- opened by the link, once */
    setOpen(true)
    form.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page
  }, [asked])
  return (
    <Group title={t('title')}>
      <div id="store" className="hairline-lit rounded-panel bg-card px-4">
        <button type="button" aria-expanded={open} onClick={toggle} className="flex min-h-14 w-full items-center gap-3 text-left font-medium">
          <Store className="size-5 text-primary" aria-hidden />{t('open')}
          <ChevronDown aria-hidden className={`ml-auto size-4 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open ? (
          <div className="grid gap-4 border-t border-hairline py-4" aria-busy={form.busy}>
            <p className="text-caption text-muted-foreground">{t('hint')}</p>
            {form.text ? <StoreFields form={form} /> : null}
            {!form.text && form.busy ? <p role="status" className="text-caption">{t('loading')}</p> : null}
            {form.status === 'loadFailed' ? <p role="alert" className="text-caption text-destructive">{t('loadFailed')}</p> : null}
          </div>
        ) : null}
      </div>
    </Group>
  )
}
