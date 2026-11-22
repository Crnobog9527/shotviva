'use client'

import { useLocale, useTranslations } from 'next-intl'

import { FIELD } from './parts'

// The 开票信息 form's inputs (billing-profile-panel.tsx holds the state). Plain controlled
// fields; the server parses and the database checks them again.

export type BillingDraft = { legalName: string; taxId: string; country: string; postcode: string; state: string; invoiceEmail: string }

// Mainland China first (most enterprise customers), then the places they most often bill from.
const COUNTRIES = ['CN', 'HK', 'MO', 'TW', 'SG', 'MY', 'JP', 'KR', 'US', 'GB', 'AU', 'CA', 'DE', 'FR'] as const

function regionName(locale: string, code: string) {
  try {
    return new Intl.DisplayNames([locale === 'zh' ? 'zh-Hans' : locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

type FieldProps = { label: string; hint?: string; value: string; onChange: (value: string) => void; maxLength: number; autoComplete?: string; type?: string; inputMode?: 'email' | 'text' }

function Field({ label, hint, value, onChange, maxLength, autoComplete, type = 'text', inputMode }: FieldProps) {
  return (
    <label className="grid gap-1 text-label">
      <span className="font-medium">{label}</span>
      <input className={FIELD} type={type} inputMode={inputMode} value={value} maxLength={maxLength} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="text-caption text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export function BillingFields({ draft, set }: { draft: BillingDraft; set: (patch: Partial<BillingDraft>) => void }) {
  const t = useTranslations('app.org.billing')
  const locale = useLocale()
  const countries = COUNTRIES.includes(draft.country as (typeof COUNTRIES)[number]) ? COUNTRIES : [draft.country, ...COUNTRIES]
  const cn = draft.country === 'CN'
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label={t('legalName')} hint={t('legalNameHint')} value={draft.legalName} maxLength={200} autoComplete="organization" onChange={(legalName) => set({ legalName })} />
      </div>
      <label className="grid gap-1 text-label">
        <span className="font-medium">{t('country')}</span>
        <select className={FIELD} value={draft.country} autoComplete="country" onChange={(e) => set({ country: e.target.value })}>
          {countries.map((code) => <option key={code} value={code}>{regionName(locale, code)}</option>)}
        </select>
      </label>
      <Field label={t(cn ? 'taxIdCn' : 'taxId')} hint={t(cn ? 'taxIdCnHint' : 'taxIdHint')} value={draft.taxId} maxLength={40} onChange={(taxId) => set({ taxId: taxId.toUpperCase() })} />
      <Field label={t('state')} value={draft.state} maxLength={80} autoComplete="address-level1" onChange={(state) => set({ state })} />
      <Field label={t('postcode')} value={draft.postcode} maxLength={16} autoComplete="postal-code" onChange={(postcode) => set({ postcode })} />
      <div className="md:col-span-2">
        <Field label={t('invoiceEmail')} hint={t('invoiceEmailHint')} type="email" inputMode="email" value={draft.invoiceEmail} maxLength={254} autoComplete="email" onChange={(invoiceEmail) => set({ invoiceEmail })} />
      </div>
    </div>
  )
}
