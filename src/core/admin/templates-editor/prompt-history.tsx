'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/core/ui/button'
import type { AdminTemplate, PromptSnapshot, TemplateAdminActions } from '../templates/types'
import type { ImageProviderOption } from '../image-provider-field'
import { type TemplateFormValues } from './form-state'
import { versionPatch } from './version-patch'
import { versionCopy as copy } from './version-copy'

export type VersionActions = Pick<TemplateAdminActions, 'versions' | 'snapshot'>
type Props = { actions: VersionActions; values: TemplateFormValues; active: number; disabled: boolean;
  providers: readonly ImageProviderOption[]; onChange: (patch: Partial<TemplateFormValues>) => void }

export function TemplateHistory({ template, ...props }: Omit<Props, 'active'> & { template: AdminTemplate | null }) {
  if (!template?.prompt || template.categoryInfo.isSystem) return null
  return <PromptHistory key={template.prompt.version} {...props} active={template.prompt.version} />
}

function providerUnavailable(snapshot: PromptSnapshot | null, providers: Props['providers']) {
  if (!snapshot?.providerId) return false
  return providers.find(p => p.id === snapshot.providerId)?.model !== snapshot.providerModel
}

function PromptHistory({ values, active, disabled, providers, actions, onChange }: Props) {
  const [rows, setRows] = useState<number[]>([])
  const [more, setMore] = useState(true)
  const [preview, setPreview] = useState<PromptSnapshot | null>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const load = (version?: number) => start(async () => {
    setError('')
    try {
      if (version !== undefined) {
        const read = await actions.snapshot({ id: values.id, version })
        if (!read.ok) return setError(read.message)
        setPreview(read.value)
      } else {
        const page = await actions.versions({ id: values.id, before: rows.at(-1) })
        if (!page.ok) return setError(page.message)
        setRows([...rows, ...page.value]); setMore(page.value.length === 30)
      }
    } catch { setError(copy.loadError) }
  })
  const unavailable = providerUnavailable(preview, providers)
  const choose = () => {
    if (preview && window.confirm(copy.confirm)) onChange(versionPatch(values, preview, !unavailable))
  }
  return (
    <fieldset disabled={disabled || pending} className="grid gap-2 rounded-md border p-3 text-sm" aria-busy={pending}>
      <legend className="px-1 font-semibold">{copy.history} · {copy.active} v{active}</legend>
      <p className="text-muted-foreground">{copy.hint}</p>
      <div className="flex flex-wrap gap-2">
        {rows.map(v => <Button key={v} type="button" size="sm" variant={v === preview?.version ? 'secondary' : 'outline'}
          aria-pressed={v === preview?.version} onClick={() => load(v)}>{`v${v}${v === active ? ' · '+copy.active : ''}`}</Button>)}
        {more && <Button type="button" size="sm" variant="outline" onClick={() => load()}>{rows.length ? copy.more : copy.preview}</Button>}
      </div>
      {pending && <p role="status">{copy.loading}</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <div className="grid gap-2">
        <strong>{copy.preview} v{preview.version}</strong>
        <p>{copy.model}：{preview.providerModel ?? copy.defaultModel}{unavailable ? ' · '+copy.unavailable : ''}</p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">{preview.body}</pre>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(preview.modelParams, null, 2)}</pre>
        <p>{copy.refs(preview.styleRefs.length)}</p>
        <div className="flex gap-1">{preview.styleRefs.map((ref, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={ref.key} className="size-12 rounded object-contain" alt={`#${i+1}`} referrerPolicy="no-referrer"
            src={`/api/admin/style-refs?${new URLSearchParams({ templateId: values.id, imageId: ref.key.split('/')[2]!.slice(0,-5) })}`} />
        ))}</div>
        <Button type="button" variant="outline" onClick={choose}>{copy.choose} v{preview.version}</Button>
      </div>}
      {values.selectedVersion && <p role="status">{copy.staged(values.selectedVersion)}</p>}
    </fieldset>
  )
}
