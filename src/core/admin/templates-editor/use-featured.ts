'use client'

import type { AdminTemplate, TemplateAdminActions } from '../templates/types'
import { featuredCopy } from './copy'
import { sameMembers } from './featured-groups'
import { featuredIds, toggleFeatured } from './featured-state'
import { useFeaturedDraft } from './use-featured-draft'
import type { useTemplateActions } from './use-template-actions'

type Run = ReturnType<typeof useTemplateActions>['run']

// Everything that changes the home featured list on this page, in one place: the saved list, the
// panel's unsaved draft, and the saves. Every save carries the list the page showed, so a list
// changed elsewhere since is refused (CONFLICT) instead of overwritten.
export function useFeatured(templates: readonly AdminTemplate[], actions: Pick<TemplateAdminActions, 'setFeatured' | 'setOrder'>, run: Run) {
  const ids = featuredIds(templates)
  const draft = useFeaturedDraft(ids)
  const write = (next: string[], success: string) =>
    sameMembers(next, ids)
      ? run(() => actions.setOrder({ group: 'featured', ids: next, expectedIds: ids }), success, undefined, featuredCopy.failed)
      : run(() => actions.setFeatured({ ids: next, expectedIds: ids }), success, undefined, featuredCopy.failed)
  return {
    ids,
    draft,
    // Locked while the panel holds an unsaved arrangement: a switch would silently drop it.
    locked: draft.dirty,
    save: (next: string[]) => write(next, featuredCopy.saved),
    toggle: (template: AdminTemplate, on: boolean) => {
      const next = draft.dirty ? null : toggleFeatured(ids, template, on)
      if (next) write(next, '首页精选已保存')
    },
  }
}

export type Featured = ReturnType<typeof useFeatured>
