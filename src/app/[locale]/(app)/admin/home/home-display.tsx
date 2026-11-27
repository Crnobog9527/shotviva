import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { BundlesPanel, CaseStripPanel, HeroPanel, listAdminTemplates, LocaleDisplayPanel, PickerSeriesProvider } from '@/core/admin'
import type { DisplayLocale } from '@/core/admin/locale-display/types'
import { listAdminCategoryTree } from '@/core/admin/template-categories'
import { HomeFeaturedPanel } from '@/core/admin/templates-editor'
import { listAdminSeriesOptions } from '@/core/admin/template-series'
import { readHomeCaseStrip } from '@/core/templates/home-case-strip-read'
import { readHomeHero } from '@/core/templates/home-hero-read'
import { readFeaturedBundles, readLocaleDisplay } from '@/core/templates/locale-display-read'

import { setFeaturedTemplatesAction, setTemplateOrderAction } from '../templates/actions'
import { deleteFeaturedBundleAction, saveFeaturedBundleAction, setDefaultFeaturedBundlesAction } from '../templates/bundle-actions'
import { saveHomeCaseStripAction } from '../templates/case-strip-action'
import { saveLocaleDisplayAction } from '../templates/category-actions'
import { saveHomeHeroAction } from '../templates/home-hero-action'

// 首页展示's four tabs (Owner 2026-11-27, admin template plan P3): 默认, 中文站, 英文站 and 组合库.
// Every block keeps its panel and server action; a language tab fixes the panels to its language.
// The pages call requireAdmin() before any of this runs.

const bundleActions = { save: saveFeaturedBundleAction, remove: deleteFeaturedBundleAction, setDefault: setDefaultFeaturedBundlesAction }

export async function loadHomeDisplay(db: SupabaseClient) {
  const [templates, categories, series, display, bundles, caseStrip, hero] = await Promise.all([
    listAdminTemplates(db), listAdminCategoryTree(db), listAdminSeriesOptions(db),
    readLocaleDisplay(db), readFeaturedBundles(db), readHomeCaseStrip(db), readHomeHero(db),
  ])
  return { templates, categories, series, display, bundles, caseStrip, hero }
}

type Data = Awaited<ReturnType<typeof loadHomeDisplay>>

function Frame({ title, intro, data, children }: { title: string; intro: ReactNode; data: Data; children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 gap-6 p-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{intro}</p>
      </div>
      <PickerSeriesProvider series={data.series}>{children}</PickerSeriesProvider>
    </div>
  )
}

// What both languages show unless they set their own: hero, featured templates, featured bundles.
export function DefaultTab({ data }: { data: Data }) {
  const { templates, categories, bundles, hero } = data
  return (
    <Frame title="首页展示 · 默认" data={data} intro={<>中文站和英文站没有单独设置的部分都显示这里的内容。按首页从上到下排。分类的默认顺序在 <Link href="/admin/templates/categories" className="underline underline-offset-4">模板与系列 › 分类</Link>。</>}>
      <HeroPanel scope="default" hero={hero} templates={templates} categories={categories} actions={{ save: saveHomeHeroAction }} />
      <HomeFeaturedPanel templates={templates} actions={{ setFeatured: setFeaturedTemplatesAction, setOrder: setTemplateOrderAction }} />
      <BundlesPanel show="default" bundles={bundles?.list ?? []} templates={templates} categories={categories} actions={bundleActions} />
    </Frame>
  )
}

const SITE = { zh: { name: '中文站', home: '/zh' }, en: { name: '英文站', home: '/' } } as const

// One language's own settings; each block says whether it follows 默认.
export function LocaleTab({ locale, data }: { locale: DisplayLocale; data: Data }) {
  const { templates, categories, display, bundles, caseStrip, hero } = data
  const site = SITE[locale]
  return (
    <Frame title={`首页展示 · ${site.name}`} data={data} intro={<>{site.name}自己的设置，没单独设置的部分跟随「默认」。按首页从上到下排。<a href={site.home} target="_blank" rel="noreferrer" className="underline underline-offset-4">在网站上看{site.name}首页 ↗</a></>}>
      <HeroPanel scope={locale} hero={hero} templates={templates} categories={categories} actions={{ save: saveHomeHeroAction }} />
      <LocaleDisplayPanel locale={locale} categories={categories} templates={templates} display={display} bundles={bundles}
        actions={{ save: saveLocaleDisplayAction }} saveBundle={saveFeaturedBundleAction} />
      <CaseStripPanel locale={locale} strip={caseStrip} templates={templates} categories={categories} bundles={bundles}
        actions={{ save: saveHomeCaseStripAction }} saveBundle={saveFeaturedBundleAction} />
    </Frame>
  )
}

export function BundlesTab({ data }: { data: Data }) {
  const { templates, categories, bundles } = data
  return (
    <Frame title="首页展示 · 组合库" data={data} intro="所有精选组合。组合不分语言，在这里建好后，到「默认」「中文站」「英文站」标签里挑着用。">
      <BundlesPanel show="library" bundles={bundles?.list ?? []} templates={templates} categories={categories} actions={bundleActions} />
    </Frame>
  )
}
