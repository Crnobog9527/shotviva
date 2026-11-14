'use client'

import { useTranslations } from 'next-intl'
import { useId, useRef } from 'react'

import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Switch } from '../../ui/switch'
import { STORE_LIMITS } from '../profile'
import type { StoreForm } from './use-store-form'

const ACCEPT = 'image/jpeg,image/png,image/webp'
const PHONE_BOXES = [0, 1, 2] as const

function Field({ label, value, max, onChange, inputMode }: { label: string; value: string; max: number; onChange(value: string): void; inputMode?: 'tel' }) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-label font-medium">{label}</label>
      <Input id={id} value={value} maxLength={max} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} className="h-11" />
    </div>
  )
}

// The fields of the store card; the container reads and saves them.
export function StoreFields({ form }: { form: StoreForm }) {
  const t = useTranslations('app.weekly.storeCard')
  const text = form.text
  if (!text) return null
  const phone = (index: number, value: string) => {
    const phones = [...text.phones]
    phones[index] = value
    form.change({ phones: phones.slice(0, STORE_LIMITS.phones) })
  }
  return (
    <div className="grid gap-4">
      <Field label={t('name')} value={text.name} max={STORE_LIMITS.name} onChange={(name) => form.change({ name })} />
      <Field label={t('nameEn')} value={text.nameEn} max={STORE_LIMITS.nameEn} onChange={(nameEn) => form.change({ nameEn })} />
      {PHONE_BOXES.map((index) => (
        <Field key={index} label={t('phone', { n: index + 1 })} value={text.phones[index] ?? ''} max={STORE_LIMITS.phone} inputMode="tel" onChange={(value) => phone(index, value)} />
      ))}
      <Field label={t('address')} value={text.address} max={STORE_LIMITS.address} onChange={(address) => form.change({ address })} />
      <Field label={t('wechat')} value={text.wechat} max={STORE_LIMITS.wechat} onChange={(wechat) => form.change({ wechat })} />
      <QrField form={form} />
      <label className="flex min-h-11 items-center justify-between gap-3 text-label">
        <span>{t('autofill')}</span>
        <Switch checked={text.autofill} onCheckedChange={(autofill) => form.change({ autofill })} />
      </label>
      <Button className="min-h-12" disabled={form.busy || form.uploading} onClick={form.save}>{form.busy ? t('saving') : t('save')}</Button>
      {form.status === 'saved' ? <p role="status" className="text-caption text-primary">{t('saved')}</p> : null}
      {form.status === 'failed' ? <p role="alert" className="text-caption text-destructive">{t('failed')}</p> : null}
    </div>
  )
}

function QrField({ form }: { form: StoreForm }) {
  const t = useTranslations('app.weekly.storeCard')
  const input = useRef<HTMLInputElement>(null)
  const { qr } = form
  return (
    <div className="grid gap-2">
      <span className="text-label font-medium">{t('qr')}</span>
      <p className="text-caption text-muted-foreground">{t('qrHint')}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local or short-lived signed preview, never optimised */}
      {qr.kind !== 'none' ? <img src={qr.url} alt={t('qr')} className="size-28 rounded-inner border border-hairline object-contain" /> : null}
      {qr.kind === 'new' && qr.failed ? <p role="alert" className="text-caption text-destructive">{t('qrFailed')}</p> : null}
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void form.pickQr(file) }} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="min-h-11" disabled={form.uploading} onClick={() => input.current?.click()}>
          {form.uploading ? t('qrUploading') : t(qr.kind === 'none' ? 'qrPick' : 'qrChange')}
        </Button>
        {qr.kind !== 'none' ? <Button variant="ghost" size="sm" className="min-h-11" onClick={form.removeQr}>{t('qrRemove')}</Button> : null}
      </div>
    </div>
  )
}
