'use client'

import { CopyPlus } from 'lucide-react'

import { effectiveStillCover } from '@/core/templates/client'
import { Button } from '@/core/ui/button'
import { CopyText } from '@/core/ui/copy-text'
import { TableCell } from '@/core/ui/table'

import type { AdminTemplate } from '../templates/types'
import { beforeAfter, PreviewThumb } from '../ui/image-preview'
import { rowCopy } from './copy'
import { TemplateThumb } from './template-thumb'
import { versionCopy } from './version-copy'

// The actions column stays pinned to the right edge, so 编辑 is in reach however wide the other
// columns get (a long category path, a narrow window or a phone). Its background is solid: the
// rows it covers scroll underneath. Hover and selection mirror the row's own tint (muted at 50%).
export const stickyActionsClass =
  'sticky right-0 z-[1] bg-background shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.45)] [tr:hover>&]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] [tr[data-state=selected]>&]:bg-muted'

// Thumbnail, Chinese name, then the id: long ids end in an ellipsis, the whole id is in the
// tooltip and a press copies it.
export function NameCell({ template }: { template: AdminTemplate }) {
  const name = template.translations.zh?.name?.trim() || template.name
  return (
    <TableCell>
      <div className="flex min-w-0 items-center gap-3">
        <PreviewThumb title={name} images={previewImages(template)}>
          <TemplateThumb template={template} className="size-11" px={44} />
        </PreviewThumb>
        <div className="grid w-max min-w-32 max-w-52 gap-0.5">
          <span className="truncate font-medium" title={name}>{name}</span>
          <CopyText value={template.id} label={rowCopy.copyId} copied={rowCopy.copied} className="text-muted-foreground max-w-full text-xs">
            <span className="block truncate" title={template.id}>{template.id}</span>
          </CopyText>
        </div>
      </div>
    </TableCell>
  )
}

// The covers the Chinese pages show, as the thumbnail does (Owner 2026-11-13: click to enlarge).
function previewImages(template: AdminTemplate) {
  return beforeAfter(
    effectiveStillCover(template.coverLocales, 'zh', 'before', template.coverBeforeUrl),
    effectiveStillCover(template.coverLocales, 'zh', 'after', template.coverAfterUrl),
  )
}

const isBuiltIn = (template: AdminTemplate) =>
  template.categoryInfo.isSystem || template.id === 'freeform' || template.id === 'edit'

type ActionsProps = {
  template: AdminTemplate
  pending: boolean
  onDuplicate: (id: string) => void
  onEdit: (template: AdminTemplate) => void
  onDelete: (template: AdminTemplate) => void
}

export function ActionsCell({ template, pending, onDuplicate, onEdit, onDelete }: ActionsProps) {
  return (
    <TableCell className={stickyActionsClass}>
      <div className="flex items-center justify-end gap-1">
        {!isBuiltIn(template) && (
          <Button variant="ghost" size="icon-sm" disabled={pending} onClick={() => onDuplicate(template.id)}
            aria-label={`${versionCopy.duplicate} ${template.name}`} title={versionCopy.duplicate}>
            <CopyPlus aria-hidden />
          </Button>
        )}
        {!template.isActive && !isBuiltIn(template) && (
          <Button variant="ghost" size="sm" className="text-destructive" disabled={pending} onClick={() => onDelete(template)}>
            {rowCopy.delete}
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={pending} onClick={() => onEdit(template)}>
          {rowCopy.edit}
        </Button>
      </div>
    </TableCell>
  )
}
