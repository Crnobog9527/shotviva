'use client'

import { useState } from 'react'

import type { ProviderFloors } from '@/core/templates/provider-pricing'

import type { ImageProviderOption } from '../image-provider-field'
import type { AdminTemplate, CoverLanguage, SaveTemplatePayload, TemplateAdminActions, TemplateOrderGroup } from '../templates/types'

import { BulkPublish } from './bulk-publish'
import type { CategoryOption } from './category-field'
import { orderCopy } from './copy'
import { FeaturedPanel } from './featured-panel'
import { FEATURED_LIMIT, featuredIds, toggleFeatured } from './featured-state'
import { matchesSearch } from './form-state'
import { selectedInOrder, toggleId, toggleVisible } from './selection-state'
import { TemplateFormDialog, type EditTarget } from './template-form-dialog'
import { catalogueOrder, Toolbar } from './toolbar'
import { TemplatesTable } from './templates-table'
import { UnpublishDialog } from './unpublish-dialog'
import { useDuplicateTemplate } from './use-duplicate-template'
import { useTemplateActions } from './use-template-actions'

type Props = {
  providers: readonly ImageProviderOption[]
  templates: AdminTemplate[]
  categories: readonly CategoryOption[]
  floor: ProviderFloors
  // The cover tabs (T87): common, launched languages, upcoming ones.
  coverLanguages: readonly CoverLanguage[]
  actions: TemplateAdminActions
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

export function TemplatesEditor({ providers, templates, categories, floor, coverLanguages, actions }: Props) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [unpublishing, setUnpublishing] = useState<AdminTemplate | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const { pending, error, notice, run, clearError } = useTemplateActions()
  const duplicate = useDuplicateTemplate(actions.duplicate, run, receipt => setEditing({ mode: 'saved', ...receipt }))
  const visible = templates.filter((template) => matchesSearch(template, query))
  const visibleIds = visible.map((template) => template.id)
  const target = currentTarget(editing, templates)

  const openEditor = (target: EditTarget) => {
    clearError()
    setEditing(target)
  }
  const toggle = (template: AdminTemplate, active: boolean) => {
    if (!active) return setUnpublishing(template)
    run(() => actions.setActive({ id: template.id, active: true }), `已上架「${template.name}」`)
  }
  const featured = featuredIds(templates)
  const setFeatured = (ids: string[]) => run(() => actions.setFeatured(ids), '首页精选已保存')
  const feature = (template: AdminTemplate, on: boolean) => {
    const ids = toggleFeatured(featured, template, on)
    if (ids) setFeatured(ids)
  }
  // Drag, keyboard or arrows (T76): the list shows the new order at once and falls back to the
  // server's order if this save fails.
  const saveOrder = (group: TemplateOrderGroup) => (ids: string[]) =>
    run(() => actions.setOrder({ group, ids }), orderCopy.saved, undefined, orderCopy.failed)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <Toolbar query={query} onQuery={setQuery} onNew={() => openEditor({ mode: 'new' })} />
      {floor.version === 'v2' && <details className="text-muted-foreground text-sm">
        <summary className="cursor-pointer">尚未上架的规划价格</summary>
        <p>精细文字海报（high）：Standard 120、HD 240、Max 360 积分。目前没有绑定此价目的模板。</p>
      </details>}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error && !target ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <FeaturedPanel
        ids={featured}
        templates={templates}
        pending={pending}
        onReorder={saveOrder('featured')}
        onRemove={(id) => setFeatured(featured.filter((other) => other !== id))}
      />
      <BulkPublish
        selected={selectedInOrder(templates, selected)}
        busy={pending}
        setActiveMany={actions.setActiveMany}
        editMany={actions.editMany}
        floor={floor}
        categories={categories}
        onClear={() => setSelected(new Set())}
      />
      <TemplatesTable
        floor={floor}
        templates={visible}
        selection={{
          selected,
          onSelect: (id, on) => setSelected((current) => toggleId(current, id, on)),
          onSelectVisible: (on) => setSelected((current) => toggleVisible(visibleIds, current, on)),
        }}
        featuredFull={featured.length >= FEATURED_LIMIT}
        onFeature={feature}
        order={catalogueOrder(query, pending, saveOrder('catalogue'))}
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
