'use client'

import { useId, useState } from 'react'

import { MAX_BODY_CHARS, PostPreview } from '@/core/blog/client'
import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'

import { BLOG_COPY as COPY } from './copy'

type Props = { value: string; disabled: boolean; onChange: (value: string) => void }

// The Markdown source and its preview, one at a time. The preview is the public page's own
// renderer, so what shows here is what readers get.
export function BodyField({ value, disabled, onChange }: Props) {
  const id = useId()
  const [preview, setPreview] = useState(false)
  const over = value.length > MAX_BODY_CHARS
  return (
    <div className="grid gap-2 text-sm">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="font-medium">{COPY.form.body}</label>
        <div className="ml-auto flex gap-1" role="group" aria-label={COPY.form.body}>
          <Button type="button" size="sm" variant={preview ? 'ghost' : 'secondary'} aria-pressed={!preview} onClick={() => setPreview(false)}>{COPY.form.write}</Button>
          <Button type="button" size="sm" variant={preview ? 'secondary' : 'ghost'} aria-pressed={preview} onClick={() => setPreview(true)}>{COPY.form.preview}</Button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-64 rounded-md border border-border bg-background p-4">
          {value.trim() === '' ? <p className="text-muted-foreground">{COPY.form.previewEmpty}</p> : <PostPreview source={value} />}
        </div>
      ) : (
        <Textarea id={id} rows={24} value={value} disabled={disabled} spellCheck onChange={(event) => onChange(event.target.value)} className="min-h-96 font-mono text-sm" />
      )}
      <p className={over ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {COPY.form.bodyHint} · {COPY.form.chars(value.length, MAX_BODY_CHARS)}
      </p>
    </div>
  )
}
