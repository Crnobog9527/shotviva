'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import type { CreditsFloor } from '@/core/templates/pricing'

import type { AdminTemplate, TemplateAdminActions } from '../templates/types'

import { FeaturedPanel } from './featured-panel'
import { FEATURED_LIMIT, featuredIds, toggleFeatured } from './featured-state'
import { matchesSearch, moveId } from './form-state'
import { TemplateFormDialog, type EditTarget } from './template-form-dialog'
import { TemplatesTable } from './templates-table'
import { UnpublishDialog } from './unpublish-dialog'
import { useTemplateActions } from './use-template-actions'

type Props = { templates: AdminTemplate[]; floor: CreditsFloor; actions: TemplateAdminActions }

export function TemplatesEditor({ templates, floor, actions }: Props) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [unpublishing, setUnpublishing] = useState<AdminTemplate | null>(null)
  const { pending, error, notice, run, clearError } = useTemplateActions()
  const visible = templates.filter((template) => matchesSearch(template, query))
  // After a cover upload the page refreshes; show the dialog the fresh row, not the snapshot.
  const target: EditTarget | null =
    editing?.mode === 'edit'
      ? { mode: 'edit', template: templates.find((t) => t.id === editing.template.id) ?? editing.template }
      : editing

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
  const move = (index: number, direction: -1 | 1) => {
    const ids = moveId(templates.map((template) => template.id), index, direction)
    if (ids) run(() => actions.reorder(ids), '排序已保存')
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="搜索 ID / 名称 / 分类"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button className="ml-auto" onClick={() => openEditor({ mode: 'new' })}>
          新建模板
        </Button>
      </div>
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error && !editing ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <FeaturedPanel ids={featured} templates={templates} pending={pending} onChange={setFeatured} />
      <TemplatesTable
        templates={visible}
        featuredFull={featured.length >= FEATURED_LIMIT}
        onFeature={feature}
        canReorder={query.trim() === ''}
        pending={pending}
        onEdit={(template) => openEditor({ mode: 'edit', template })}
        onToggle={toggle}
        onMove={move}
      />
      {target ? (
        <TemplateFormDialog
          key={target.mode === 'edit' ? target.template.id : 'new'}
          target={target}
          floor={floor}
          coverActions={actions}
          pending={pending}
          error={error}
          onCancel={() => setEditing(null)}
          onSubmit={(payload) => run(() => actions.save(payload), '已保存', () => setEditing(null))}
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
