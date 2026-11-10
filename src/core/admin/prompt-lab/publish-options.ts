import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

import { referenceCategories } from '../reference-library/read'
import { listAdminCategoryTree } from '../template-categories'
import { categoryChoices } from '../templates-editor/category-options'
import { nodePath, suggestCategory } from './publish-suggestion'
import { readLabSources } from './store'
import type { LabPublishOptions } from './types'

export async function loadPublishOptions(db: SupabaseClient, asset: { id: string; categoryId: string }): Promise<LabPublishOptions> {
  const [references, templates, sources] = await Promise.all([
    referenceCategories(db), listAdminCategoryTree(db), readLabSources(db, asset.id),
  ])
  const path = nodePath(references, asset.categoryId)
  const offered = templates.filter(node => !node.isSystem)
  return {
    categories: categoryChoices(offered).map(choice => ({ key: choice.key, label: `${choice.label} · ${choice.nameEn}` })),
    suggestedCategory: suggestCategory(path, offered), leafNameEn: path.at(-1)?.nameEn, sources,
  }
}
