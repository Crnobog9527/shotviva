'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy } from 'lucide-react'

import type { EnterpriseContact } from '@/core/config'
import { Button } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

// 「联系我们转账」 on the purchasing page (Owner 2026-11-22): enterprise customers already have a
// named contact from their hand onboarding, so the button opens that contact (a dialog, a bottom
// sheet on a phone) instead of a support ticket. The values come from site.config.
export function TransferContactButton({ contact }: { contact: EnterpriseContact }) {
  const t = useTranslations('app.org.contact')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="glass" size="touch" onClick={() => setOpen(true)}>{t('open')}</Button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={t('title')} description={t('body')}>
        <dl className="mt-4 divide-y divide-hairline rounded-control bg-card px-4 shadow-[inset_0_0_0_1px_var(--border)]">
          <ContactRow label={t('name')} value={contact.name} />
          <ContactRow label={t('email')} value={contact.email} copy />
          <ContactRow label={t('wechat')} value={contact.wechat} copy />
        </dl>
      </ResponsiveSheet>
    </>
  )
}

function ContactRow({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  const t = useTranslations('app.org.contact')
  const [done, setDone] = useState<boolean | null>(null)
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
    } catch {
      setDone(false)
    }
  }
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <dt className="text-caption text-muted-foreground">{label}</dt>
        <dd className="truncate text-body font-medium select-all">{value}</dd>
      </div>
      {copy ? (
        <span className="flex shrink-0 items-center gap-2">
          <span role="status" className="text-caption text-muted-foreground">{done === false ? t('copyFailed') : null}</span>
          <Button type="button" variant="glass" size="touch" onClick={onCopy} aria-label={`${t('copy')} ${label}`}>
            {done ? <Check /> : <Copy />}{done ? t('copied') : t('copy')}
          </Button>
        </span>
      ) : null}
    </div>
  )
}
