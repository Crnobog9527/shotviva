'use client'

import { useState, type ComponentProps } from 'react'
import { Button } from '@/core/ui/button'
import { categoryChoices, type CategoryOption } from './category-options'
import { catalogSections, filterCatalog, SINGLE_TEMPLATES, type CatalogStatus, type SeriesOption } from './catalog-groups'
import { catalogCopy as copy, orderCopy } from './copy'
import { TemplatesTable, type TableSelection } from './templates-table'

type Props = Omit<ComponentProps<typeof TemplatesTable>, 'selection' | 'order' | 'categoryLabels'> & {
  query: string
  categories: readonly CategoryOption[]
  series: readonly SeriesOption[]
  onOrder: (group: 'active' | 'inactive', expectedIds: string[]) => (ids: string[]) => Promise<void>
  selection: Omit<TableSelection, 'onSelectVisible'> & { onSelectGroup: (ids: string[], on: boolean) => void }
}

const selectClass = 'border-input h-9 max-w-full rounded-md border px-3 text-sm'

export function CatalogView({ templates, query, categories, series, selection, onOrder, ...row }: Props) {
  const [status, setStatus] = useState<CatalogStatus>('active')
  const [category, setCategory] = useState('')
  const [seriesId, setSeriesId] = useState('')
  const [grouped, setGrouped] = useState(false)
  const options = categoryChoices(categories).concat(categories.filter(c => c.isSystem)
    .map(c => ({ key: c.key, label: c.nameZh, nameEn: c.nameEn, path: [c.key] })))
  const paths = new Map(options.map(c => [c.key, c]))
  const matching = filterCatalog(templates, paths, category, seriesId)
  const active = matching.filter(t => t.isActive).length
  const tabs = { active: `${copy.active}（${active}）`, inactive: `${copy.inactive}（${matching.length - active}）`, all: copy.all }
  const sections = catalogSections(matching, status, grouped, series)
  const canReorder = !query.trim() && !category && !seriesId && !grouped
  return <div className="grid min-w-0 gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={copy.status} className="flex gap-1">
        {(Object.keys(tabs) as CatalogStatus[]).map(key => <Button key={key} variant={status === key ? 'secondary' : 'ghost'}
          size="sm" aria-pressed={status === key} onClick={() => setStatus(key)}>{tabs[key]}</Button>)}
      </div>
      <select aria-label={copy.category} className={selectClass} value={category} onChange={e => setCategory(e.target.value)}>
        <option value="">{copy.categories}</option>
        {options.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <select aria-label={copy.seriesFilter} className={selectClass} value={seriesId} onChange={e => setSeriesId(e.target.value)}>
        <option value="">{copy.allSeries}</option>
        <option value={SINGLE_TEMPLATES}>{copy.single}</option>
        {series.map(s => <option key={s.id} value={s.id}>{s.nameZh}</option>)}
      </select>
      <Button size="sm" variant={grouped ? 'secondary' : 'outline'} aria-pressed={grouped}
        onClick={() => setGrouped(!grouped)}>{copy.groupSeries}</Button>
    </div>
    {sections.length === 0 && <p className="text-muted-foreground py-8 text-center text-sm">{copy.empty}</p>}
    {sections.map(({ id, title, rows, orderGroup }) => (
      <section key={id} className="min-w-0">
        {title && <h3 className="bg-muted px-3 py-2 text-sm font-semibold">{title}（{rows.length}）</h3>}
        <TemplatesTable {...row} templates={rows} categoryLabels={paths}
          order={{ disabled: !canReorder || row.pending, disabledHint: canReorder ? undefined : orderCopy.filtered,
            onReorder: async ids => { if (canReorder && orderGroup) await onOrder(orderGroup, rows.map(t => t.id))(ids) } }}
          selection={{ ...selection, onSelectVisible: on => selection.onSelectGroup(rows.map(t => t.id), on) }} />
      </section>
    ))}
  </div>
}
