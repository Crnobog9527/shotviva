'use client'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Switch } from '@/core/ui/switch'
import { TableCell, TableRow } from '@/core/ui/table'

import type { AdminTemplate } from '../templates/types'
import { bulkCopy } from './copy'
import { canFeature } from './featured-state'

const SURFACE_LABEL = { web: '站内', partner: '伙伴' } as const

export type RowHandlers = {
  // Reordering is only meaningful on the full, unfiltered list.
  canReorder: boolean
  pending: boolean
  onEdit: (template: AdminTemplate) => void
  onToggle: (template: AdminTemplate, active: boolean) => void
  onMove: (index: number, direction: -1 | 1) => void
  // 首页精选 (T53): whether the list is full, and the switch handler.
  featuredFull: boolean
  onFeature: (template: AdminTemplate, on: boolean) => void
}

type Props = RowHandlers & {
  template: AdminTemplate
  index: number
  last: boolean
  // Bulk selection (T60).
  checked: boolean
  onSelect: (id: string, on: boolean) => void
}

export function TemplateRow(props: Props) {
  const { template, index, last, checked, onSelect, canReorder, pending, onEdit, onToggle, onMove, featuredFull, onFeature } = props
  return (
    <TableRow data-state={checked ? 'selected' : undefined}>
      <TableCell>
        <Checkbox
          aria-label={bulkCopy.selectRow(template.name)}
          checked={checked}
          onCheckedChange={(on) => onSelect(template.id, on === true)}
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`上移 ${template.name}`}
            disabled={!canReorder || pending || index === 0}
            onClick={() => onMove(index, -1)}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`下移 ${template.name}`}
            disabled={!canReorder || pending || last}
            onClick={() => onMove(index, 1)}
          >
            ↓
          </Button>
        </div>
      </TableCell>
      <TableCell>
        <div className="font-medium">{template.name}</div>
        <div className="text-muted-foreground font-mono text-xs">{template.id}</div>
      </TableCell>
      <TableCell>{template.categoryInfo.nameZh}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          {template.visibleIn.map((surface) => (
            <Badge key={surface} variant="secondary">
              {SURFACE_LABEL[surface]}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        {`${template.creditsCost['1k']} / ${template.creditsCost['2k']} / ${template.creditsCost['3k']}`}
        <span className="text-muted-foreground block text-xs">{template.quality}</span>
      </TableCell>
      <TableCell>{template.prompt ? `v${template.prompt.version}` : '缺失'}</TableCell>
      <TableCell>
        <Switch
          checked={template.isActive}
          disabled={pending}
          aria-label={`${template.isActive ? '下架' : '上架'} ${template.name}`}
          onCheckedChange={(checked) => onToggle(template, checked)}
        />
      </TableCell>
      <TableCell>
        <FeaturedSwitch template={template} full={featuredFull} pending={pending} onFeature={onFeature} />
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => onEdit(template)}>
          编辑
        </Button>
      </TableCell>
    </TableRow>
  )
}

// Off and disabled while the template is unpublished or partner-only, or the list is full.
function FeaturedSwitch({ template, full, pending, onFeature }: { template: AdminTemplate; full: boolean; pending: boolean; onFeature: RowHandlers['onFeature'] }) {
  const on = template.featuredRank !== null
  const blocked = !on && (!canFeature(template) || full)
  return (
    <Switch
      checked={on}
      disabled={pending || blocked}
      title={blocked ? (canFeature(template) ? '最多 12 个' : '只有已上架、站内可见的模板能上首页') : undefined}
      aria-label={`${on ? '移出' : '加入'}首页精选 ${template.name}`}
      onCheckedChange={(checked) => onFeature(template, checked)}
    />
  )
}
