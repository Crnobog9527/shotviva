import type { Metadata } from 'next'

import { BundlesPanel, CaseStripPanel, HeroPanel, listAdminTemplates, LocaleDisplayPanel, PickerSeriesProvider } from '@/core/admin'
import { listAdminCategoryTree } from '@/core/admin/template-categories'
import { HomeFeaturedPanel } from '@/core/admin/templates-editor'
import { listAdminSeriesOptions } from '@/core/admin/template-series'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { readHomeCaseStrip } from '@/core/templates/home-case-strip-read'
import { readHomeHero } from '@/core/templates/home-hero-read'
import { readFeaturedBundles, readLocaleDisplay } from '@/core/templates/locale-display-read'

import { setFeaturedTemplatesAction, setTemplateOrderAction } from '../templates/actions'
import { deleteFeaturedBundleAction, saveFeaturedBundleAction, setDefaultFeaturedBundlesAction } from '../templates/bundle-actions'
import { saveHomeCaseStripAction } from '../templates/case-strip-action'
import { saveLocaleDisplayAction } from '../templates/category-actions'
import { saveHomeHeroAction } from '../templates/home-hero-action'

// 首页展示 (Owner 2026-11-27, admin template plan P2): everything that decides what the home page
// shows, moved here from /admin/templates with the same panels and server actions, in the order the
// home page shows them. Admin-only and request-time; the proxy 404s non-admins first.
export const instant = false

export const metadata: Metadata = { title: '首页展示' }

export default async function AdminHomeDisplayPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [templates, categories, series, display, bundles, caseStrip, homeHero] = await Promise.all([
    listAdminTemplates(db), listAdminCategoryTree(db), listAdminSeriesOptions(db),
    readLocaleDisplay(db), readFeaturedBundles(db), readHomeCaseStrip(db), readHomeHero(db),
  ])
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 gap-6 p-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">首页展示</h1>
        <p className="max-w-prose text-sm text-muted-foreground">按首页从上到下排：首屏大图、首页精选、精选组合、分语言的顺序和精选、更多真实案例。保存后首页随后更新。</p>
      </div>
      <PickerSeriesProvider series={series}>
        <HeroPanel hero={homeHero} templates={templates} categories={categories} actions={{ save: saveHomeHeroAction }} />
        <HomeFeaturedPanel templates={templates} actions={{ setFeatured: setFeaturedTemplatesAction, setOrder: setTemplateOrderAction }} />
        <BundlesPanel
          bundles={bundles?.list ?? []} templates={templates} categories={categories}
          actions={{ save: saveFeaturedBundleAction, remove: deleteFeaturedBundleAction, setDefault: setDefaultFeaturedBundlesAction }}
        />
        <LocaleDisplayPanel
          categories={categories} templates={templates} display={display} bundles={bundles}
          actions={{ save: saveLocaleDisplayAction }} saveBundle={saveFeaturedBundleAction}
        />
        <CaseStripPanel
          strip={caseStrip} templates={templates} categories={categories} bundles={bundles}
          actions={{ save: saveHomeCaseStripAction }} saveBundle={saveFeaturedBundleAction}
        />
      </PickerSeriesProvider>
    </div>
  )
}
