'use client'

import { useState } from 'react'

import type { ProviderFloors } from '@/core/templates/provider-pricing'

import type { ImageProviderOption } from '../image-provider-field'
import type { AdminTemplate, CoverLanguage, SaveTemplatePayload, TemplateAdminActions, TemplateOrderGroup } from '../templates/types'

import { BulkPublish } from './bulk-publish'
import type { CategoryOption } from './category-field'
import { orderCopy } from './copy'
import { FeaturedPanel } from './featured-panel'
import { FEATURED_LIMIT } from './featured-state'
import { matchesSearch } from './form-state'
import { selectedInOrder, toggleId, toggleVisible } from './selection-state'
import { TemplateFormDialog, type EditTarget } from './template-form-dialog'
import type { SeriesOption } from './catalog-groups'
import { CatalogView } from './catalog-view'
import { Toolbar } from './toolbar'
import { UnpublishDialog } from './unpublish-dialog'
import { useDuplicateTemplate } from './use-duplicate-template'
import { useFeatured } from './use-featured'
import { useTemplateActions } from './use-template-actions'

type Props = {
  providers: readonly ImageProviderOption[]
  templates: AdminTemplate[]
  series: readonly SeriesOption[]
  categories: readonly CategoryOption[]
  floor: ProviderFloors
  // The cover tabs (T87): common, launched languages, upcoming ones.
  coverLanguages: readonly CoverLanguage[]
  actions: TemplateAdminActions
  // A template id from the page's ?edit= link; opened once the list has it.
  initialEdit?: string
}

// 'saved': a new template just saved, shown in edit mode (with the test-run panel, T85) as soon as
// the refreshed list has it.
type Editing = EditTarget | { mode: 'saved'; id: string; previousStandard?: number | null }

// After a save the page refreshes; the dialog shows the fresh row, not the snapshot.
function currentTarget(editing: Editing | null, templates: readonly AdminTemplate[]): EditTarget | null {
  if (!editing || editing.mode === 'new') return editing
  const id = editing.mode === 'saved' ? editing.id : editing.template.id
  const fresh = templates.find((t) => t.id === id)
  if (editing.mode === 'saved') return fresh ? { mode: 'edit', template: fresh, previousStandard: editing.previousStandard } : null
  return { mode: 'edit', template: fresh ?? editing.template }
}

// A save keeps the dialog open so the prompt can be tried right away (ARCHITECTURE §10.b 「入口」).
function afterSave(payload: SaveTemplatePayload): Editing {
  const id = (payload.template as { id?: unknown }).id
  return { mode: 'saved', id: typeof id === 'string' ? id : '' }
}

export function TemplatesEditor({ providers, templates, categories, series, floor, coverLanguages, actions, initialEdit }: Props) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing | null>(initialEdit ? { mode: 'saved', id: initialEdit } : null)
  const [unpublishing, setUnpublishing] = useState<AdminTemplate | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const { pending, error, notice, run, clearError } = useTemplateActions()
  const duplicate = useDuplicateTemplate(actions.duplicate, run, receipt => setEditing({ mode: 'saved', ...receipt }))
  const visible = templates.filter((template) => matchesSearch(template, query))
  const target = currentTarget(editing, templates)

  const openEditor = (target: EditTarget) => {
    clearError()
    setEditing(target)
  }
  const toggle = (template: AdminTemplate, active: boolean) => {
    if (!active) return setUnpublishing(template)
    run(() => actions.setActive({ id: template.id, active: true }), `已上架「${template.name}」`)
  }
  const featured = useFeatured(templates, actions, run)
  // Drag, keyboard or arrows (T76): the list shows the new order at once and falls back to the
  // server's order if this save fails.
  const saveOrder = (group: TemplateOrderGroup, expectedIds: string[]) => (ids: string[]) =>
    run(() => actions.setOrder({ group, ids, expectedIds }), orderCopy.saved, undefined, orderCopy.failed)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <Toolbar query={query} onQuery={setQuery} onNew={() => openEditor({ mode: 'new' })} />
      {floor.version === 'v2' && <details className="text-muted-foreground text-sm">
        <summary className="cursor-pointer">尚未上架的规划价格</summary>
        <p>精细文字海报（high）：1K 120、2K 240、4K 360 积分。目前没有绑定此价目的模板。</p>
      </details>}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error && !target ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <FeaturedPanel featured={featured} templates={templates} pending={pending} />
      <BulkPublish providers={providers}
        selected={selectedInOrder(templates, selected)}
        busy={pending}
        actions={actions}
        featured={{ ids: featured.ids, locked: featured.locked }}
        floor={floor}
        categories={categories}
        onClear={() => setSelected(new Set())}
      />
      <CatalogView query={query} series={series} categories={categories}
        floor={floor}
        templates={visible}
        selection={{
          selected,
          onSelect: (id, on) => setSelected((current) => toggleId(current, id, on)),
          onSelectGroup: (ids, on) => setSelected((current) => toggleVisible(ids, current, on)),
        }}
        featuredState={{ full: featured.ids.length >= FEATURED_LIMIT, locked: featured.locked }}
        onFeature={featured.toggle}
        onOrder={saveOrder}
        pending={pending}
        onDuplicate={duplicate}
        onEdit={(template) => openEditor({ mode: 'edit', template })}
        onToggle={toggle}
      />
      {target ? (
        <TemplateFormDialog
          key={target.mode === 'edit' ? target.template.id : 'new'}
          target={target}
          providers={providers}
          floor={floor}
          categories={categories}
          series={series}
          templates={templates}
          coverLanguages={coverLanguages}
          coverActions={actions}
          pending={pending}
          error={error}
          onCancel={() => setEditing(null)}
          notice={notice}
          onSubmit={(payload, saved) => run(() => actions.save(payload), '已保存', result => { saved(result.version); setEditing(afterSave(payload)) })}
        />
      ) : null}
      <UnpublishDialog
        template={unpublishing}
        pending={pending}
        onCancel={() => setUnpublishing(null)}
        onConfirm={(reason) => {
          const target = unpublishing
          if (!target) return
          setUnpublishing(null)
          run(() => actions.setActive({ id: target.id, active: false, reason }), `已下架「${target.name}」`)
        }}
      />
    </div>
  )
}
