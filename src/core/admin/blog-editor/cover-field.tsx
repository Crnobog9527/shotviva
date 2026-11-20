'use client'

import { useId, useRef, useState } from 'react'

import { coverFileProblem } from '../covers/client'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import type { ActionValue } from '../templates/types'
import { BLOG_COPY as COPY } from './copy'

export type CoverActions = {
  requestUpload: (input: { contentType: string; size: number }) => Promise<ActionValue<{ key: string; putUrl: string; headers: { 'Content-Type': string } }>>
  apply: (input: { key: string }) => Promise<ActionValue<string>>
}

type Props = {
  url: string
  alt: string
  actions: CoverActions
  disabled: boolean
  onChange: (next: { url: string; alt: string }) => void
}

// One cover: pick a file → presigned PUT into the private bucket → the server converts it and
// returns its public address, which the form keeps until the post is saved.
export function CoverField({ url, alt, actions, disabled, onChange }: Props) {
  const altId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const upload = async (file: File) => {
    const invalid = coverFileProblem('before', file)
    if (invalid) return setProblem(invalid)
    setBusy(true)
    setProblem(null)
    try {
      const ticket = await actions.requestUpload({ contentType: file.type, size: file.size })
      if (!ticket.ok) return setProblem(ticket.message)
      const put = await fetch(ticket.value.putUrl, { method: 'PUT', headers: ticket.value.headers, body: file })
      if (!put.ok) return setProblem('上传失败，请重试')
      const applied = await actions.apply({ key: ticket.value.key })
      if (applied.ok) onChange({ url: applied.value, alt })
      else setProblem(applied.message)
    } catch {
      setProblem('上传失败，请重试')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <fieldset className="grid gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{COPY.form.cover}</legend>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- the public cover, previewed as the page shows it
        <img src={url} alt={alt} className="aspect-[1200/630] w-full max-w-md rounded-md border border-border object-cover" />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => input.current?.click()}>
          {busy ? COPY.form.coverUploading : COPY.form.coverUpload}
        </Button>
        {url ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={() => onChange({ url: '', alt: '' })}>
            {COPY.form.coverRemove}
          </Button>
        ) : null}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} />
      </div>
      <p className="text-xs text-muted-foreground">{COPY.form.coverHint}</p>
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      {url ? (
        <div className="grid gap-1 text-sm">
          <label htmlFor={altId} className="font-medium">{COPY.form.coverAlt}</label>
          <Input id={altId} value={alt} maxLength={200} disabled={disabled} onChange={(event) => onChange({ url, alt: event.target.value })} />
          <p className="text-xs text-muted-foreground">{COPY.form.coverAltHint}</p>
        </div>
      ) : null}
    </fieldset>
  )
}
