'use client'

import Link from 'next/link'

import { Badge } from '@/core/ui/badge'

import type { SaveOutcome } from '../blog'
import type { ActionValue } from '../templates/types'
import { BodyField } from './body-field'
import { BLOG_COPY as COPY } from './copy'
import { CoverField, type CoverActions } from './cover-field'
import { EditorBar } from './editor-bar'
import { TextFields } from './text-fields'
import { usePostEditor } from './use-post-editor'
import type { PostForm } from './form-state'

export type BlogAdminActions = {
  save: (input: unknown) => Promise<ActionValue<SaveOutcome>>
  setStatus: (input: { id: string; publish: boolean }) => Promise<ActionValue<{ locale: string; slug: string }>>
  cover: CoverActions
}

type Props = { initial: PostForm; status: 'draft' | 'published' | null; actions: BlogAdminActions }

// /admin/blog/new and /admin/blog/[id]: the text fields, the cover, the Markdown with its
// preview; save draft, publish, take down. A new post is saved first (it gets its id), then
// published.
export function PostEditor({ initial, status: initialStatus, actions }: Props) {
  const editor = usePostEditor(initial, initialStatus, actions)
  const { form, status, pending } = editor
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/blog" className="text-sm underline underline-offset-4">{COPY.back}</Link>
        {status ? <Badge variant={status === 'published' ? 'default' : 'secondary'}>{COPY.status[status]}</Badge> : null}
      </div>
      <TextFields form={form} locked={status === 'published'} disabled={pending} onChange={editor.edit} />
      <CoverField url={form.coverUrl} alt={form.coverAlt} actions={actions.cover} disabled={pending} onChange={({ url, alt }) => editor.patch({ coverUrl: url, coverAlt: alt })} />
      <BodyField value={form.bodyMd} disabled={pending} onChange={(bodyMd) => editor.patch({ bodyMd })} />
      {editor.error ? <p role="alert" className="text-sm text-destructive">{editor.error}</p> : null}
      {editor.notice ? <p className="text-sm text-success">{editor.notice}</p> : null}
      <EditorBar form={form} status={status} pending={pending} dirty={editor.dirty} valid={editor.valid} onSave={editor.save} onSwitch={editor.switchTo} />
    </div>
  )
}
