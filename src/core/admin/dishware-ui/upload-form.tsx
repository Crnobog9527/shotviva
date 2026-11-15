'use client'

import { useState } from 'react'

import type { DishCategory } from '@/core/templates/food-flow'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { CategorySelect } from './category-select'
import { dishwareCopy as copy } from './copy'
import type { DishwareActions } from './types'
import { useDishwareWrite } from './use-dishware-save'

type Draft = { label: string; category: DishCategory; shape: string; file: File | null }

// Staging PUT straight to the bucket (§8.1), then the server re-encodes it and the row is saved.
async function uploadAndSave(actions: DishwareActions, draft: Draft & { file: File }) {
  const staged = await actions.stage({ contentType: draft.file.type, size: draft.file.size })
  if (!staged.ok) return staged
  const put = await fetch(staged.value.putUrl, { method: 'PUT', headers: staged.value.headers, body: draft.file })
  if (!put.ok) return { ok: false as const, code: 'INTERNAL' as const, message: '图片上传失败，请重试' }
  const finished = await actions.finish({ id: staged.value.id, uploadId: staged.value.uploadId })
  if (!finished.ok) return finished
  return actions.save({ ...finished.value, label: draft.label.trim(), category: draft.category, shape: draft.shape.trim(), isActive: true })
}

export function DishwareUpload({ actions }: { actions: DishwareActions }) {
  const [draft, setDraft] = useState<Draft>({ label: '', category: 'long', shape: '', file: null })
  const write = useDishwareWrite()
  const ready = draft.file && draft.label.trim() && draft.shape.trim()
  const submit = () => {
    if (draft.file) write.run(() => uploadAndSave(actions, { ...draft, file: draft.file! }))
  }
  return (
    <section className="grid max-w-xl gap-2 rounded-lg border p-4">
      <h2 className="font-medium">{copy.uploadTitle}</h2>
      <label className="grid gap-1 text-sm">{copy.pickImage}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setDraft({ ...draft, file: event.target.files?.[0] ?? null })} />
      </label>
      <Input aria-label={copy.label} placeholder={copy.label} value={draft.label} maxLength={40} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
      <CategorySelect id="new-dishware-category" value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
      <textarea aria-label={copy.shape} placeholder={copy.shape} className="min-h-20 rounded-md border bg-background p-2 text-sm" maxLength={200}
        value={draft.shape} onChange={(event) => setDraft({ ...draft, shape: event.target.value })} />
      <Button className="justify-self-start" disabled={!ready || write.pending} onClick={submit}>{write.pending ? copy.uploading : copy.upload}</Button>
      {write.error && <p role="alert" className="text-sm text-destructive">{write.error}</p>}
    </section>
  )
}
