import type { SupabaseClient } from '@supabase/supabase-js'
import type { AbstractIntlMessages } from 'next-intl'

import { BundlesPanel, CaseStripPanel, CategoriesPanel, HeroPanel, listAdminTemplates, LocaleDisplayPanel, PickerSeriesProvider, TemplatesEditor } from '@/core/admin'
import { ScrollToHash } from '@/core/admin/shell'
import { pricingFromOptions } from '@/core/admin/templates/provider-pricing'
import { readPricingOptions } from '@/site/template-pricing'
import { ModelSyncProvider } from '@/core/admin/image-provider-field/model-sync'
import { listAdminCategoryTree } from '@/core/admin/template-categories'
import { listAdminSeriesOptions, OrderHelp } from '@/core/admin/template-series'
import { readHomeCaseStrip } from '@/core/templates/home-case-strip-read'
import { readHomeHero } from '@/core/templates/home-hero-read'
import { readFeaturedBundles, readLocaleDisplay } from '@/core/templates/locale-display-read'
import { deleteFeaturedBundleAction, saveFeaturedBundleAction, setDefaultFeaturedBundlesAction } from './bundle-actions'
import { saveHomeCaseStripAction } from './case-strip-action'
import { saveHomeHeroAction } from './home-hero-action'
import { moveTemplateCategoryAction, saveLocaleDisplayAction } from './category-actions'
import { AdminTemplatePreview } from './preview-provider'
import { setTemplateSaleAction } from './sale-action'
import { deleteTemplatesAction, setTemplatesSaleAction, setTemplatesSeriesAction } from './bulk-actions'
import { syncTemplateModel } from './sync-model-action'
import { loadMessages } from '@/site/i18n/messages'
import { site } from '@/site/site.config'

import { duplicateTemplateAction, listVersionsAction, manageVersionAction, readVersionAction } from './version-actions'
import {
  applyCoverAction, bulkEditTemplatesAction, deleteTemplateCategoryAction, saveTemplateCategoryAction,
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
  return Promise.all([listAdminTemplates(db), listAdminCategoryTree(db), listAdminSeriesOptions(db), readPricingOptions(db), previewMessages(), readLocaleDisplay(db), readFeaturedBundles(db), readHomeCaseStrip(db), readHomeHero(db)])
}

export async function Catalogue({ data, edit }: { data: ReturnType<typeof loadCatalogue>; edit?: string }) {
  const [templates, categories, series, providers, zhMessages, display, bundles, caseStrip, homeHero] = await data
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 gap-6 p-6">
      <h1 className="text-xl font-semibold">模板与系列</h1>
      <OrderHelp />
      <CategoriesPanel
        categories={categories}
        actions={{ save: saveTemplateCategoryAction, move: moveTemplateCategoryAction, remove: deleteTemplateCategoryAction }}
      />
      <PickerSeriesProvider series={series}>
      {/* 侧栏「首页展示」 lands here until it has its own pages (Owner 2026-11-27). */}
      <section id="home-display" aria-labelledby="home-display-h" className="grid scroll-mt-4 grid-cols-1 gap-6">
      <h2 id="home-display-h" className="text-lg font-semibold">首页展示</h2>
      <ScrollToHash id="home-display" />
      <BundlesPanel
        bundles={bundles?.list ?? []} templates={templates} categories={categories}
        actions={{ save: saveFeaturedBundleAction, remove: deleteFeaturedBundleAction, setDefault: setDefaultFeaturedBundlesAction }}
      />
      <LocaleDisplayPanel
        categories={categories} templates={templates} display={display} bundles={bundles}
        actions={{ save: saveLocaleDisplayAction }} saveBundle={saveFeaturedBundleAction}
      />
      <HeroPanel hero={homeHero} templates={templates} categories={categories} actions={{ save: saveHomeHeroAction }} />
      <CaseStripPanel
        strip={caseStrip} templates={templates} categories={categories} bundles={bundles}
        actions={{ save: saveHomeCaseStripAction }} saveBundle={saveFeaturedBundleAction}
      />
      </section>
      </PickerSeriesProvider>
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
