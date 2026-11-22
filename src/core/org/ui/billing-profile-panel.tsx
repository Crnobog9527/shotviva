'use client'

import { useState, useTransition } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ReceiptText } from 'lucide-react'

import { Button } from '@/core/ui/button'

import type { BillingProfile } from '../billing/profile'
import type { BillingResult } from '../billing/commands'
import { BillingFields, type BillingDraft } from './billing-profile-fields'
import { Panel, Result } from './parts'
import type { Outcome } from './use-console-action'

// 「开票信息」 on the enterprise workbench (ARCHITECTURE §6.5), owner only. Saved here, the org's
// company name and tax ID go into every later Waffo checkout its primary admin opens, so the
// Waffo invoice carries the company title. It is Waffo's commercial invoice, not a 增值税发票.

export type BillingActions = {
  save: (input: BillingDraft) => Promise<BillingResult<{ profile: BillingProfile }>>
  clear: () => Promise<BillingResult<{ cleared: boolean }>>
}

const EMPTY: BillingDraft = { legalName: '', taxId: '', country: 'CN', postcode: '', state: '', invoiceEmail: '' }

function draftOf(p: BillingProfile | null): BillingDraft {
  if (!p) return EMPTY
  return { legalName: p.legalName, taxId: p.taxId, country: p.country, postcode: p.postcode ?? '', state: p.state ?? '', invoiceEmail: p.invoiceEmail ?? '' }
}

function useBillingForm(initial: BillingProfile | null, actions: BillingActions) {
  const t = useTranslations('app.org.billing')
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(() => draftOf(initial))
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [pending, startTransition] = useTransition()
  const fail = (error: string) => setOutcome({ ok: false, text: t(`errors.${error}`) })
  const save = () => startTransition(async () => {
    setOutcome(null)
    const result = await actions.save(draft).catch(() => ({ ok: false, error: 'FAILED' }) as const)
    if (!result.ok) return fail(result.error)
    setSaved(result.profile)
    setDraft(draftOf(result.profile))
    setOutcome({ ok: true, text: t('saved') })
  })
  const clear = () => startTransition(async () => {
    setOutcome(null)
    const result = await actions.clear().catch(() => ({ ok: false, error: 'FAILED' }) as const)
    if (!result.ok) return fail(result.error)
    setSaved(null)
    setDraft(draftOf(null))
    setOutcome({ ok: true, text: t('cleared') })
  })
  return { saved, draft, set: (patch: Partial<BillingDraft>) => setDraft((d) => ({ ...d, ...patch })), outcome, pending, save, clear }
}

export function BillingProfilePanel({ profile, unavailable, actions }: { profile: BillingProfile | null; unavailable: boolean; actions: BillingActions }) {
  const t = useTranslations('app.org.billing')
  const format = useFormatter()
  const form = useBillingForm(profile, actions)
  const ready = form.draft.legalName.trim().length >= 2 && form.draft.taxId.trim().length >= 3
  return (
    <Panel title={t('title')} hint={t('hint')}>
      <p className="rounded-control bg-muted px-3 py-2.5 text-caption leading-relaxed text-muted-foreground">{t('notFapiao')}</p>
      {unavailable ? <p role="alert" className="text-label text-destructive">{t('unavailable')}</p> : (
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (!form.pending && ready) form.save() }}>
          <BillingFields draft={form.draft} set={form.set} />
          {form.saved ? <p className="text-caption text-muted-foreground">{t('updatedAt', { date: format.dateTime(new Date(form.saved.updatedAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="touch" variant="glass" disabled={form.pending || !ready}><ReceiptText />{form.pending ? t('saving') : t('save')}</Button>
            {form.saved ? <Button type="button" size="touch" variant="ghost" disabled={form.pending} onClick={form.clear}>{t('clear')}</Button> : null}
            <Result outcome={form.outcome} />
          </div>
        </form>
      )}
    </Panel>
  )
}
