'use client'

import type { AdminTemplate, TemplateAdminActions } from '../templates/types'
import { FeaturedPanel } from './featured-panel'
import { useFeatured } from './use-featured'
import { useTemplateActions } from './use-template-actions'

type Props = {
  templates: AdminTemplate[]
  actions: Pick<TemplateAdminActions, 'setFeatured' | 'setOrder'>
}

// 首页精选 on its own, for the 首页展示 page (Owner 2026-11-27): the same panel, saves and conflict
// check the templates page used. Adding a template stays the 首页精选 switch in the template list.
export function HomeFeaturedPanel({ templates: all, actions }: Props) {
  const templates = all.filter((template) => !template.deletedAt)
  const { pending, error, notice, run } = useTemplateActions()
  const featured = useFeatured(templates, actions, run)
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
      <FeaturedPanel featured={featured} templates={templates} pending={pending} />
    </div>
  )
}
