'use client'

import { STYLE_STANDARD_CREDITS, type CreditsFloor } from '@/core/templates/pricing'
import { RESOLUTIONS } from '@/core/templates/output-options'
import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Switch } from '@/core/ui/switch'
import { TableCell, TableRow } from '@/core/ui/table'

import type { AdminTemplate } from '../templates/types'
import { DragHandle, MoveButtons, sortableRowClass, useSortableItem } from '../ui/sortable'
import { bulkCopy } from './copy'
import { unsupportedTier } from './tier-price'
import { canFeature } from './featured-state'

const SURFACE_LABEL = { web: '站内', partner: '伙伴' } as const

export type RowHandlers = {
  pending: boolean
  onEdit: (template: AdminTemplate) => void
  onToggle: (template: AdminTemplate, active: boolean) => void
  // 首页精选 (T53): whether the list is full, and the switch handler.
  featuredFull: boolean
  onFeature: (template: AdminTemplate, on: boolean) => void
}

type Props = RowHandlers & {
  template: AdminTemplate
  price: CreditsFloor
  // Bulk selection (T60).
  checked: boolean
  onSelect: (id: string, on: boolean) => void
}

// One row of the catalogue; dragged by its handle (or long-pressed on touch), T76.
export function TemplateRow(props: Props) {
  const { template, price, checked, onSelect, pending, onEdit, onToggle, featuredFull, onFeature } = props
  const item = useSortableItem(template.id)
  return (
    <TableRow {...item.row} className={sortableRowClass} data-state={checked ? 'selected' : undefined}>
      <TableCell>
        <Checkbox
          aria-label={bulkCopy.selectRow(template.name)}
          checked={checked}
          onCheckedChange={(on) => onSelect(template.id, on === true)}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center">
          <DragHandle handle={item.handle} />
          <MoveButtons item={item} />
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
        {summaryPrice(template, price)}
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

function summaryPrice(template: AdminTemplate, floor: CreditsFloor) {
  if (floor.styleDraft) return `规划 ${STYLE_STANDARD_CREDITS} / 未定 / 未定（未开放）`
  if (floor.retiredRoom) return '已下架 · 未开放'
  return RESOLUTIONS.map(r => unsupportedTier(floor, r) ? '不可用' : template.creditsCost[r]).join(' / ')
}
