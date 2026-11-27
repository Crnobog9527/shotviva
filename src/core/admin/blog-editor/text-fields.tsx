'use client'

import { useId } from 'react'

import { Input } from '@/core/ui/input'

import { BLOG_COPY as COPY } from './copy'
import type { PostForm } from './form-state'

type Props = { form: PostForm; locked: boolean; disabled: boolean; onChange: (patch: Partial<PostForm>) => void }

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor: string }) {
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={htmlFor} className="font-medium">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

// Language, address, title, meta description, author. `locked` marks a published post, whose
// language and address should stay (the change is allowed but warned about in the hint).
export function TextFields({ form, locked, disabled, onChange }: Props) {
  const id = useId()
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={COPY.form.locale} hint={locked ? COPY.form.localeHint : undefined} htmlFor={`${id}-locale`}>
        <select
          id={`${id}-locale`}
          value={form.locale}
          disabled={disabled || locked}
          onChange={(event) => onChange({ locale: event.target.value as PostForm['locale'] })}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="en">{COPY.locales.en}</option>
          <option value="zh">{COPY.locales.zh}</option>
        </select>
      </Field>
      <Field label={COPY.form.slug} hint={COPY.form.slugHint} htmlFor={`${id}-slug`}>
        <Input id={`${id}-slug`} value={form.slug} maxLength={100} disabled={disabled} onChange={(event) => onChange({ slug: event.target.value })} />
      </Field>
      <div className="md:col-span-2">
        <Field label={COPY.form.title} hint={COPY.form.titleHint} htmlFor={`${id}-title`}>
          <Input id={`${id}-title`} value={form.title} maxLength={160} disabled={disabled} onChange={(event) => onChange({ title: event.target.value })} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label={COPY.form.description} hint={`${COPY.form.descriptionHint} ${form.description.length} / 320`} htmlFor={`${id}-description`}>
          <Input id={`${id}-description`} value={form.description} maxLength={320} disabled={disabled} onChange={(event) => onChange({ description: event.target.value })} />
        </Field>
      </div>
      <Field label={COPY.form.author} hint={COPY.form.authorHint} htmlFor={`${id}-author`}>
        <Input id={`${id}-author`} value={form.authorName} maxLength={80} disabled={disabled} onChange={(event) => onChange({ authorName: event.target.value })} />
      </Field>
    </div>
  )
}
