'use client'

import { useState } from 'react'

import { useRouter } from '@/core/i18n/navigation'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { suggestTemplateId } from '../prompt-lab/publish-suggestion'
import type { LabPublishOptions, LabRun } from '../prompt-lab/types'
import { labError, labRequest } from './api'
import { publishCopy as c } from './copy'

const SELECT = 'border-input h-9 rounded-md border bg-transparent px-3 text-sm'
type Props = { run: LabRun; options: LabPublishOptions; onClose(): void }

export const modelName = (model: string) => model.split('/').slice(1).join('/') || model

// 「发布为模板」 (T101): a create action that ends on the template editor, so it gets a dialog.
export function PublishDialog({ run, options, onClose }: Props) {
  const router = useRouter()
  const [id, setId] = useState(() => suggestTemplateId(options.leafNameEn, run.id))
  const [name, setName] = useState('')
  const [nameZh, setNameZh] = useState('')
  const [category, setCategory] = useState(options.suggestedCategory ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const receipt = await labRequest<{ id: string }>('publish', {
        runId: run.id, template: { id: id.trim(), name: name.trim(), nameZh: nameZh.trim() || null, category },
      })
      router.push('/admin/templates?edit=' + encodeURIComponent(receipt.id))
    } catch (e) { setError(labError(e)); setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent><form onSubmit={submit} className="grid gap-4">
      <DialogHeader><DialogTitle>{c.title}</DialogTitle><DialogDescription>{c.description}</DialogDescription></DialogHeader>
      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt>{c.version}</dt><dd>v{run.prompt_lab_versions.version_no}</dd>
        <dt>{c.model}</dt><dd className="break-all">{modelName(run.model)}</dd>
        <dt>{c.output}</dt><dd>{run.resolution} · {run.quality === 'high' ? c.high : c.medium}</dd>
        <dt>{c.style}</dt><dd>{run.use_style_reference ? c.styleYes : c.styleNo}</dd>
      </dl>
      <p className="text-muted-foreground text-xs">{c.cover}</p>
      <Field id="publish-id" label={c.id} hint={c.idHint}>
        <Input id="publish-id" value={id} maxLength={64} required pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={e => setId(e.target.value)} /></Field>
      <Field id="publish-name" label={c.name}>
        <Input id="publish-name" value={name} maxLength={120} required onChange={e => setName(e.target.value)} /></Field>
      <Field id="publish-name-zh" label={c.nameZh}>
        <Input id="publish-name-zh" value={nameZh} maxLength={120} onChange={e => setNameZh(e.target.value)} /></Field>
      <Field id="publish-category" label={c.category} hint={options.suggestedCategory ? c.suggested : c.noSuggestion}>
        <select id="publish-category" className={SELECT} value={category} required onChange={e => setCategory(e.target.value)}>
          <option value="" disabled>{c.pickCategory}</option>
          {options.categories.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select></Field>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{c.cancel}</Button>
        <Button type="submit" disabled={busy || !name.trim() || !category}>{busy ? c.publishing : c.submit}</Button></DialogFooter>
    </form></DialogContent>
  </Dialog>
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label htmlFor={id}>{label}</Label>{children}
    {hint && <p className="text-muted-foreground text-xs">{hint}</p>}</div>
}
