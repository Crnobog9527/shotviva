'use client'

import { useState, type ComponentProps } from 'react'
import { Button } from '@/core/ui/button'
import type { AdminTemplate } from '../templates/types'
import type { CategoryOption } from './category-field'
import { catalogCopy as copy } from './copy'
import { catalogueOrder } from './toolbar'
import { TemplatesTable, type TableSelection } from './templates-table'

type Status = 'active' | 'inactive' | 'all'
type Props = Omit<ComponentProps<typeof TemplatesTable>, 'selection' | 'order'> & {
  query: string; all: AdminTemplate[]; categories: readonly CategoryOption[]
  onOrder: (group: Exclude<Status, 'all'>) => (ids: string[]) => Promise<void>
  selection: Omit<TableSelection, 'onSelectVisible'> & { onSelectGroup: (ids: string[], on: boolean) => void }
}

export function CatalogView({ all, templates, query, categories, selection, onOrder, ...row }: Props) {
  const [status, setStatus] = useState<Status>('active')
  const [category, setCategory] = useState('')
  const groups = {
    active: templates.filter(t => t.isActive && (!category || t.category === category)),
    inactive: templates.filter(t => !t.isActive && (!category || t.category === category)),
  }
  const activeCount = all.filter(t => t.isActive).length
  const tabs = { active: `${copy.active}（${activeCount}）`, inactive: `${copy.inactive}（${all.length - activeCount}）`, all: copy.all }
  const shown = status === 'all' ? ['active', 'inactive'] as const : [status] as const
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={copy.status} className="flex gap-1">
        {(Object.keys(tabs) as Status[]).map(key => <Button key={key} variant={status === key ? 'secondary' : 'ghost'}
          size="sm" aria-pressed={status === key} onClick={() => setStatus(key)}>{tabs[key]}</Button>)}
      </div>
      <select aria-label={copy.category} className="border-input h-9 rounded-md border px-3 text-sm"
        value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">{copy.categories}</option>
        {categories.map(c => <option key={c.key} value={c.key}>{c.nameZh}</option>)}
      </select>
    </div>
    {shown.map(group => {
      const rows = groups[group]
      return <section key={group}>
        {status === 'all' && <h3 className="bg-muted px-3 py-2 text-sm font-semibold">{copy[group]}</h3>}
        <TemplatesTable {...row} templates={rows} order={catalogueOrder(query.trim() || category, row.pending, onOrder(group))}
          selection={{ ...selection, onSelectVisible: on => selection.onSelectGroup(rows.map(t => t.id), on) }} />
      </section>
    })}
  </div>
}
