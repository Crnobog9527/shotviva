'use client'

import { Button } from '@/core/ui/button'
import type { AdminTemplate, VersionSummary } from '../templates/types'
import { VersionList } from './version-list'
import { usePromptHistory, type HistoryOptions } from './use-prompt-history'
import { versionCopy as copy } from './version-copy'
import { PreviewThumb } from '../ui/image-preview'
import { styleRefUrl } from './style-ref-url'

export type { VersionActions } from './use-prompt-history'
type Props = HistoryOptions & { active: number; disabled: boolean }

export function TemplateHistory({ template, ...props }: Omit<Props, 'active'> & { template: AdminTemplate | null }) {
  if (!template?.prompt || template.categoryInfo.isSystem) return null
  return <PromptHistory key={template.prompt.version} {...props} active={template.prompt.version} />
}

const moreLabel = (rows: VersionSummary[]) => rows.length ? copy.more : copy.preview

function PromptHistory({ active, disabled, ...options }: Props) {
  const { values } = options
  const { rows, more, preview, pending, error, unavailable, load, choose, manage } = usePromptHistory(options)
  return (
    <fieldset disabled={disabled || pending} className="grid gap-2 rounded-md border p-3 text-sm" aria-busy={pending}>
      <legend className="px-1 font-semibold">{copy.history} · {copy.active} v{active}</legend>
      <p className="text-muted-foreground">{copy.hint}</p>
      <div className="flex flex-wrap gap-2">
        <VersionList rows={rows} active={active} preview={preview?.version} onPreview={load} onManage={manage} />
        {more && <Button type="button" size="sm" variant="outline" onClick={() => load()}>{moreLabel(rows)}</Button>}
      </div>
      {pending && <p role="status">{copy.loading}</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <div className="grid gap-2">
        <strong>{copy.preview} v{preview.version}</strong>
        <p>{copy.model}：{preview.providerModel ?? copy.defaultModel}{unavailable ? ' · '+copy.unavailable : ''}</p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">{preview.body}</pre>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(preview.modelParams, null, 2)}</pre>
        <p>{copy.refs(preview.styleRefs.length)}</p>
        <div className="flex gap-1">{preview.styleRefs.map((ref, i) => {
          const url = styleRefUrl(ref.key)
          return (
            <PreviewThumb key={ref.key} title={`#${i + 1}`} images={url ? [{ url, label: `#${i + 1}` }] : []}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="size-12 rounded object-contain" alt={`#${i + 1}`} referrerPolicy="no-referrer" src={url ?? undefined} />
            </PreviewThumb>
          )
        })}</div>
        <Button type="button" variant="outline" onClick={choose}>{copy.choose} v{preview.version}</Button>
      </div>}
      {values.selectedVersion && <p role="status">{copy.staged(values.selectedVersion)}</p>}
    </fieldset>
  )
}
