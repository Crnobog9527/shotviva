import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'

import { CategoriesPanel, listAdminTemplates, TemplatesEditor } from '@/core/admin'
import { pricingFromOptions } from '@/core/admin/templates/provider-pricing'
import { readPricingOptions } from '@/site/template-pricing'
import { ModelSyncProvider } from '@/core/admin/image-provider-field/model-sync'
import { listAdminCategoryTree } from '@/core/admin/template-categories'
import { listAdminSeriesOptions, seriesCopy } from '@/core/admin/template-series'
import { moveTemplateCategoryAction } from './category-actions'
import { setTemplateSaleAction } from './sale-action'
import { syncTemplateModel } from './sync-model-action'
import { site } from '@/site/site.config'

import { duplicateTemplateAction, listVersionsAction, manageVersionAction, readVersionAction } from './version-actions'
import {
  applyCoverAction, bulkEditTemplatesAction, deleteTemplateCategoryAction, saveTemplateCategoryAction,
  setFeaturedTemplatesAction, requestCoverUploadAction, saveTemplateAction, setTemplateActiveAction,
  setTemplateOrderAction, setTemplatesActiveAction,
} from './actions'

// The cover tabs (ARCHITECTURE §8.3, T87): the common cover, the site's languages, then the ones
// registered as upcoming. Names in Chinese from the code, so a new language needs no copy.
const zhName = new Intl.DisplayNames(['zh-Hans'], { type: 'language' })
const COVER_LANGUAGES = [
  { code: null, label: '通用', upcoming: false },
  ...site.locales.enabled.map((code) => ({ code, label: zhName.of(code) ?? code, upcoming: false })),
  ...(site.locales.upcoming ?? []).map((code) => ({ code, label: zhName.of(code) ?? code, upcoming: true })),
]

export function loadCatalogue(db: SupabaseClient) {
  return Promise.all([listAdminTemplates(db), listAdminCategoryTree(db), listAdminSeriesOptions(db), readPricingOptions(db)])
}

export async function Catalogue({ data, edit }: { data: ReturnType<typeof loadCatalogue>; edit?: string }) {
  const [templates, categories, series, providers] = await data
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 gap-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">模板与提示词</h1>
        <Link href="/admin/templates/series" className="text-sm underline underline-offset-4">{seriesCopy.title}</Link>
        <Link href="/admin/templates/edit" className="text-sm underline underline-offset-4">
          作品编辑的判断题和约束段落 →
        </Link>
      </div>
      <CategoriesPanel
        categories={categories}
        actions={{ save: saveTemplateCategoryAction, move: moveTemplateCategoryAction, remove: deleteTemplateCategoryAction }}
      />
      <ModelSyncProvider action={syncTemplateModel}>
      <TemplatesEditor initialEdit={edit}
        templates={templates} series={series}
        providers={providers}
        categories={categories}
        floor={pricingFromOptions(providers)}
        coverLanguages={COVER_LANGUAGES}
        actions={{
          manageVersion: manageVersionAction,
          setSale: setTemplateSaleAction, duplicate: duplicateTemplateAction, versions: listVersionsAction, snapshot: readVersionAction,
          save: saveTemplateAction,
          setActive: setTemplateActiveAction,
          setActiveMany: setTemplatesActiveAction,
          editMany: bulkEditTemplatesAction,
          setOrder: setTemplateOrderAction,
          setFeatured: setFeaturedTemplatesAction,
          requestCoverUpload: requestCoverUploadAction,
          applyCover: applyCoverAction,
        }}
      />
      </ModelSyncProvider>
    </div>
  )
}
