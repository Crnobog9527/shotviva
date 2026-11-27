'use client'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { CategoryTree, type TreeMove } from '../ui/category-tree'
import type { AdminCategoryNode } from '../template-categories/types'
import { rolledUpCounts, type CategoryCounts } from './category-counts'
import { CATEGORIES_COPY as COPY } from './copy'

type Props = {
  categories: readonly AdminCategoryNode[]
  pending: boolean
  onMove: (move: TreeMove) => void
  onAdd: (parent: AdminCategoryNode) => void
  onEdit: (category: AdminCategoryNode) => void
  onDelete: (category: AdminCategoryNode) => void
}

export function CategoryList({ categories, pending, onMove, onAdd, onEdit, onDelete }: Props) {
  if (!categories.length) return <p className="text-sm text-muted-foreground">{COPY.empty}</p>
  const parents = new Set(categories.map(node => node.parentId))
  const counts = rolledUpCounts(categories)
  return <CategoryTree nodes={categories} labelOf={node => node.nameZh} disabled={pending} storageKey="template-categories"
    onMove={onMove} rootOnly={node => node.key === 'art-styles'}
    renderRow={(node, meta) => <>
      <div className="mr-auto min-w-36 flex-1 text-sm">
        <span className="font-medium">{node.nameZh}</span> · {node.nameEn}
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          <Counts total={counts.get(node.key)} parent={parents.has(node.key)} />
          {meta.collapsed && <span> · {COPY.childCount(meta.childCount)}</span>}
          {!node.isVisible && <Badge variant="outline">{COPY.hidden}</Badge>}
        </div>
      </div>
      {node.level < 3 && <Button variant="outline" size="sm" disabled={pending} onClick={() => onAdd(node)}>{COPY.addChild}</Button>}
      <Button variant="outline" size="sm" disabled={pending} onClick={() => onEdit(node)}>{COPY.edit}</Button>
      <Button variant="ghost" size="sm" className="text-destructive" disabled={pending || parents.has(node.key)}
        title={parents.has(node.key) ? COPY.hasChildren : COPY.remove} onClick={() => onDelete(node)}>{COPY.remove}</Button>
    </>} />
}

// Totals include the children's templates and series; a parent that also holds some itself says so.
function Counts({ total, parent }: { total: CategoryCounts | undefined; parent: boolean }) {
  if (!total) return null
  const direct = parent && (total.directTemplates > 0 || total.directSeries > 0)
  return <>
    <span>{COPY.count(total.templates)}</span>
    {total.series > 0 && <span> · {COPY.seriesCount(total.series)}</span>}
    {direct && <span> · {COPY.direct(total.directTemplates, total.directSeries)}</span>}
  </>
}
