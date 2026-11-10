'use client'

import { Button } from '@/core/ui/button'
import type { VersionSummary } from '../templates/types'
import { versionCopy as copy } from './version-copy'

type Props = {
  rows: VersionSummary[]
  active: number
  preview?: number
  onPreview: (version: number) => void
  onManage: (row: VersionSummary, action: 'rename' | 'delete') => void
}

export function VersionList({ rows, active, preview, onPreview, onManage }: Props) {
  return <div className="grid w-full gap-1">
    {rows.map(row => <div key={row.version} className="flex flex-wrap items-center gap-2 text-xs">
      <Button type="button" size="sm" variant={preview === row.version ? 'secondary' : 'outline'}
        aria-pressed={preview === row.version} onClick={() => onPreview(row.version)}>
        {[`v${row.version}`,row.display_name,active === row.version && copy.active].filter(Boolean).join(' · ')}
      </Button>
      <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('zh-CN')}</time>
      <Button type="button" size="sm" variant="ghost" onClick={() => onManage(row, 'rename')}>{copy.rename}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={row.version === active} onClick={() => onManage(row, 'delete')}>{copy.remove}</Button>
    </div>)}
  </div>
}
