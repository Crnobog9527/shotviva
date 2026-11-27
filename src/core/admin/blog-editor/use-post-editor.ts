'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useAdminAction } from '../shell/use-admin-action'
import type { BlogAdminActions } from './post-editor'
import { BLOG_COPY as COPY } from './copy'
import { slugFromTitle, toInput, type PostForm } from './form-state'

// The editor's state: the form, the last saved copy (to tell unsaved edits), the status, and
// the three things a person can do: save, publish, take down.
export function usePostEditor(initial: PostForm, initialStatus: 'draft' | 'published' | null, actions: BlogAdminActions) {
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [status, setStatus] = useState(initialStatus)
  const { pending, error, notice, run } = useAdminAction()
  const patch = (next: Partial<PostForm>) => setForm((current) => ({ ...current, ...next }))
  const input = toInput(form)

  // On a post that is not saved yet, the address follows the title until the admin edits it.
  const edit = (next: Partial<PostForm>) => {
    const follows = form.id === null && form.slug === slugFromTitle(form.title)
    patch(next.title !== undefined && follows ? { ...next, slug: slugFromTitle(next.title) } : next)
  }

  const save = () =>
    run(
      () => actions.save(input),
      (outcome) => {
        setStatus(outcome.status)
        setSaved({ ...form, id: outcome.id })
        patch({ id: outcome.id })
        if (form.id === null) router.replace(`/admin/blog/${outcome.id}`)
        return COPY.saved
      },
    )
  const switchTo = (publish: boolean) =>
    run(
      () => actions.setStatus({ id: form.id as string, publish }),
      () => {
        setStatus(publish ? 'published' : 'draft')
        return publish ? COPY.published : COPY.unpublished
      },
    )

  return { form, status, pending, error, notice, valid: input !== null, dirty: JSON.stringify(form) !== JSON.stringify(saved), patch, edit, save, switchTo }
}
