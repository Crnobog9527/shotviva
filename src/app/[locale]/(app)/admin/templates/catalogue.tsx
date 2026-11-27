import type { SupabaseClient } from '@supabase/supabase-js'
import type { AbstractIntlMessages } from 'next-intl'

import Link from 'next/link'

import { listAdminTemplates, TemplatesEditor } from '@/core/admin'
import { pricingFromOptions } from '@/core/admin/templates/provider-pricing'
import { readPricingOptions } from '@/site/template-pricing'
import { ModelSyncProvider } from '@/core/admin/image-provider-field/model-sync'
import { listAdminCategoryTree } from '@/core/admin/template-categories'
import { listAdminSeriesOptions, OrderHelp } from '@/core/admin/template-series'
import { AdminTemplatePreview } from './preview-provider'
import { setTemplateSaleAction } from './sale-action'
import { deleteTemplatesAction, setTemplatesSaleAction, setTemplatesSeriesAction } from './bulk-actions'
import { syncTemplateModel } from './sync-model-action'
import { loadMessages } from '@/site/i18n/messages'
import { site } from '@/site/site.config'

import { duplicateTemplateAction, listVersionsAction, manageVersionAction, readVersionAction } from './version-actions'
import {
  applyCoverAction, bulkEditTemplatesAction,
  setFeaturedTemplatesAction, setTemplatesFeaturedAction, requestCoverUploadAction, saveTemplateAction, setTemplateActiveAction,
  setTemplateOrderAction, setTemplatesActiveAction, deleteTemplateAction,
} from './actions'

// The cover tabs (ARCHITECTURE §8.3, T87): the common cover, the site's languages, then the ones
// registered as upcoming. Names in Chinese from the code, so a new language needs no copy.
const zhName = new Intl.DisplayNames(['zh-Hans'], { type: 'language' })
const COVER_LANGUAGES = [
  { code: null, label: '通用', upcoming: false },
  ...site.locales.enabled.map((code) => ({ code, label: zhName.of(code) ?? code, upcoming: false })),
  ...(site.locales.upcoming ?? []).map((code) => ({ code, label: zhName.of(code) ?? code, upcoming: true })),
]

// The zh copy the 实时预览's Chinese creation dialog reads (the admin itself renders in English).
async function previewMessages() {
  const { app, paywall } = await loadMessages('zh')
  return { app, paywall } as AbstractIntlMessages
}

export function loadCatalogue(db: SupabaseClient) {
  return Promise.all([listAdminTemplates(db), listAdminCategoryTree(db), listAdminSeriesOptions(db), readPricingOptions(db), previewMessages()])
}

export async function Catalogue({ data, edit }: { data: ReturnType<typeof loadCatalogue>; edit?: string }) {
  const [templates, categories, series, providers, zhMessages] = await data
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 gap-6 p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold">模板与系列</h1>
        {/* The home sections and the category tree used to sit here (Owner 2026-11-27, plan P2). */}
        <p className="text-sm text-muted-foreground">
          首页精选、精选组合、首屏大图等在 <Link href="/admin/home" className="underline underline-offset-4">首页展示</Link>，分类在上方「分类」标签。
        </p>
      </div>
      <OrderHelp />
      <ModelSyncProvider action={syncTemplateModel}>
      <AdminTemplatePreview zhMessages={zhMessages}>
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
          setFeaturedMany: setTemplatesFeaturedAction,
          requestCoverUpload: requestCoverUploadAction,
          applyCover: applyCoverAction,
          remove: deleteTemplateAction,
          removeMany: deleteTemplatesAction,
          setSaleMany: setTemplatesSaleAction,
          setSeriesMany: setTemplatesSeriesAction,
        }}
      />
      </AdminTemplatePreview>
      </ModelSyncProvider>
    </div>
  )
}
