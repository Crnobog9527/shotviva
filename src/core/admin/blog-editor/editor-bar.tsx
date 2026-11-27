'use client'

import Link from 'next/link'

import { Button } from '@/core/ui/button'

import { BLOG_COPY as COPY } from './copy'
import type { PostForm } from './form-state'

type Props = {
  form: PostForm
  status: 'draft' | 'published' | null
  pending: boolean
  dirty: boolean
  valid: boolean
  onSave: () => void
  onSwitch: (publish: boolean) => void
}

// The one reason the bar has to give right now: what is missing before a publish or a save.
function hint({ saved, dirty, valid }: { saved: boolean; dirty: boolean; valid: boolean }): string | null {
  if (!valid) return COPY.invalid
  if (!saved) return COPY.unsavedFirst
  return dirty ? COPY.dirty : null
}

const Hint = ({ text }: { text: string | null }) => (text ? <span className="text-xs text-muted-foreground">{text}</span> : null)

// Save draft, publish, take down, and why one of them is not offered right now.
export function EditorBar({ form, status, pending, dirty, valid, onSave, onSwitch }: Props) {
  const saved = form.id !== null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={pending || !valid} onClick={onSave}>{status === null ? COPY.save : COPY.saveEdit}</Button>
      {saved && status === 'draft' ? <Button variant="secondary" disabled={pending || dirty} onClick={() => onSwitch(true)}>{COPY.publish}</Button> : null}
      {saved && status === 'published' ? <Button variant="outline" disabled={pending} onClick={() => onSwitch(false)}>{COPY.unpublish}</Button> : null}
      <Hint text={hint({ saved, dirty, valid })} />
      {status === 'published' ? <Link href={`${form.locale === 'zh' ? '/zh' : ''}/blog/${form.slug}`} className="text-sm underline underline-offset-4">{COPY.viewLive}</Link> : null}
    </div>
  )
}
