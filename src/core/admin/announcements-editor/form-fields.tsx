'use client'

import { useId } from 'react'

import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'

import { ANNOUNCEMENTS_COPY } from './copy'

type FieldProps = { label: string; hint?: string; value: string; type?: string; onChange: (value: string) => void }

export function FormField({ label, hint, value, type = 'text', onChange }: FieldProps) {
  const id = useId()
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

type ColumnProps = {
  title: string
  message: string
  label: string
  max: { message: number; label: number }
  onMessage: (value: string) => void
  onLabel: (value: string) => void
}

// One language's text and link label, with a live character count against the 140 limit.
export function LanguageColumn({ title, message, label, max, onMessage, onLabel }: ColumnProps) {
  const id = useId()
  const over = message.length > max.message
  return (
    <fieldset className="grid gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-1 text-sm">
        <label htmlFor={id} className="font-medium">
          {ANNOUNCEMENTS_COPY.form.message}
        </label>
        <Textarea id={id} rows={3} value={message} onChange={(event) => onMessage(event.target.value)} />
        <p className={over ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {message.length} / {max.message}
        </p>
      </div>
      <FormField label={ANNOUNCEMENTS_COPY.form.linkLabel} value={label} onChange={onLabel} />
    </fieldset>
  )
}
