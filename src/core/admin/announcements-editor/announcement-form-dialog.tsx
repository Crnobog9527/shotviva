'use client'

import { useState } from 'react'

import { MESSAGE_MAX, LINK_LABEL_MAX } from '@/core/announcements/rules'
import { BannerBar } from '@/core/announcements/ui'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import { ANNOUNCEMENTS_COPY } from './copy'
import { FormField, LanguageColumn } from './form-fields'
import type { AnnouncementForm } from './form-state'

const COPY = ANNOUNCEMENTS_COPY.form

type Props = {
  open: boolean
  isNew: boolean
  initial: AnnouncementForm
  pending: boolean
  error: string | null
  onCancel: () => void
  onSave: (form: AnnouncementForm) => void
}

// Both languages side by side (ARCHITECTURE §10), with a live preview of each.
export function AnnouncementFormDialog({ open, isNew, initial, pending, error, onCancel, onSave }: Props) {
  const [form, setForm] = useState(initial)
  const set = (patch: Partial<AnnouncementForm>) => setForm((prev) => ({ ...prev, ...patch }))
  const link = (label: string) => (form.linkUrl ? { url: form.linkUrl, label: label || null } : null)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isNew ? COPY.titleNew : COPY.titleEdit}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <LanguageColumn
            title={COPY.zh}
            message={form.messageZh}
            label={form.linkLabelZh}
            onMessage={(messageZh) => set({ messageZh })}
            onLabel={(linkLabelZh) => set({ linkLabelZh })}
            max={{ message: MESSAGE_MAX, label: LINK_LABEL_MAX }}
          />
          <LanguageColumn
            title={COPY.en}
            message={form.messageEn}
            label={form.linkLabelEn}
            onMessage={(messageEn) => set({ messageEn })}
            onLabel={(linkLabelEn) => set({ linkLabelEn })}
            max={{ message: MESSAGE_MAX, label: LINK_LABEL_MAX }}
          />
        </div>
        <SharedFields form={form} set={set} />
        <div className="grid gap-2">
          <p className="text-sm font-medium">{COPY.preview}</p>
          <BannerBar message={form.messageZh || '—'} link={link(form.linkLabelZh)} tone={form.tone} dismissLabel="" />
          <BannerBar message={form.messageEn || '—'} link={link(form.linkLabelEn)} tone={form.tone} dismissLabel="" />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.cancel}
          </Button>
          <Button disabled={pending} onClick={() => onSave(form)}>
            {pending ? COPY.saving : COPY.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SharedFields({ form, set }: { form: AnnouncementForm; set: (patch: Partial<AnnouncementForm>) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label={COPY.linkUrl} hint={COPY.linkHint} value={form.linkUrl} onChange={(linkUrl) => set({ linkUrl })} />
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{COPY.tone}</span>
        <select
          className="h-9 rounded-md border border-input bg-transparent px-3"
          value={form.tone}
          onChange={(event) => set({ tone: event.target.value === 'promo' ? 'promo' : 'info' })}
        >
          <option value="info">{ANNOUNCEMENTS_COPY.tones.info}</option>
          <option value="promo">{ANNOUNCEMENTS_COPY.tones.promo}</option>
        </select>
      </label>
      <FormField label={COPY.startsAt} type="datetime-local" value={form.startsAt} onChange={(startsAt) => set({ startsAt })} />
      <FormField label={COPY.endsAt} type="datetime-local" value={form.endsAt} onChange={(endsAt) => set({ endsAt })} />
    </div>
  )
}
