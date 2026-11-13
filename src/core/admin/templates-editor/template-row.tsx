'use client'

import { type CreditsFloor } from '@/core/templates/pricing'
import { Badge } from '@/core/ui/badge'
import { Checkbox } from '@/core/ui/checkbox'
import { Switch } from '@/core/ui/switch'
import { TableCell, TableRow } from '@/core/ui/table'

import type { AdminTemplate } from '../templates/types'
import { DragHandle, MoveButtons, sortableRowClass, useSortableItem } from '../ui/sortable'
import { bulkCopy, featuredCopy, rowCopy } from './copy'
import { summaryPrice } from './tier-price'
import { canFeature } from './featured-state'
import { ActionsCell, NameCell } from './row-cells'
import { CATALOGUE_GAP_LABEL, catalogueGapText } from './catalogue-gap'

const SURFACE_LABEL = { web: '站内', partner: '伙伴' } as const

export type RowHandlers = {
  pending: boolean
  onDuplicate: (id: string) => void
  onEdit: (template: AdminTemplate) => void
  // 删除 (Owner 2026-11-13): shown on unpublished, non-built-in rows; opens the confirmation.
  onDelete: (template: AdminTemplate) => void
  onToggle: (template: AdminTemplate, active: boolean) => void
  // 首页精选 (T53): whether the list is full or held by an unsaved arrangement, and the switch handler.
  featuredState: { full: boolean; locked: boolean }
  onFeature: (template: AdminTemplate, on: boolean) => void
}

type Props = RowHandlers & {
  template: AdminTemplate
  categoryLabel: string
  price: CreditsFloor
  // Bulk selection (T60).
  checked: boolean
  onSelect: (id: string, on: boolean) => void
}

// One row of the catalogue; dragged by its handle (or long-pressed on touch), T76.
export function TemplateRow(props: Props) {
  const { template, price, checked, onSelect, pending, onEdit, onToggle, featuredState, onFeature } = props
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
        <span className="text-muted-foreground block text-xs tabular-nums" title={rowCopy.orderNumberHint}>{rowCopy.orderNumber(template.sortOrder)}</span>
      </TableCell>
      <NameCell template={template} />
      <TableCell>
        <span className="block w-max min-w-16 max-w-32 truncate" title={props.categoryLabel}>{props.categoryLabel}</span>
      </TableCell>
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
        {summaryPrice(template.creditsCost, price, template.unpricedResolutions)}
        <span className="text-muted-foreground block text-xs">{template.quality}</span>
        {template.catalogueGap && (
          <Badge variant="destructive" className="mt-1" title={catalogueGapText(template.catalogueGap)}>
            {CATALOGUE_GAP_LABEL}
          </Badge>
        )}
        {template.catalogueGap && (
          <span className="text-destructive block max-w-40 text-xs">{catalogueGapText(template.catalogueGap)}</span>
        )}
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
        <FeaturedSwitch template={template} state={featuredState} pending={pending} onFeature={onFeature} />
      </TableCell>
      <ActionsCell template={template} pending={pending} onDuplicate={props.onDuplicate} onEdit={onEdit} onDelete={props.onDelete} />
    </TableRow>
  )
}

// Off and disabled while the template is unpublished or partner-only, or the list is full; both
// ways disabled while 首页精选 holds an unsaved arrangement (a switch would drop it).
function FeaturedSwitch({ template, state, pending, onFeature }: { template: AdminTemplate; state: RowHandlers['featuredState']; pending: boolean; onFeature: RowHandlers['onFeature'] }) {
  const on = template.featuredRank !== null
  const blocked = !on && (!canFeature(template) || state.full)
  const why = state.locked ? featuredCopy.locked : blocked ? (canFeature(template) ? '最多 12 个' : '只有已上架、站内可见的模板能上首页') : undefined
  return (
    <Switch
      checked={on}
      disabled={pending || blocked || state.locked}
      title={why}
      aria-label={`${on ? '移出' : '加入'}首页精选 ${template.name}`}
      onCheckedChange={(checked) => onFeature(template, checked)}
    />
  )
}
