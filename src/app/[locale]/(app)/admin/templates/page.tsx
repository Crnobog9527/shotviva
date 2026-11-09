import type { Metadata } from 'next'
import Link from 'next/link'

import { CategoriesPanel, listAdminCategories, listAdminTemplates, TemplatesEditor } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { pricingFromOptions } from '@/core/admin/templates/provider-pricing'
import { readPricingOptions } from './pricing'
import { site } from '@/site/site.config'

import {
  applyCoverAction,
  bulkEditTemplatesAction,
  deleteTemplateCategoryAction,
  reorderTemplateCategoriesAction,
  saveTemplateCategoryAction,
  setFeaturedTemplatesAction,
  requestCoverUploadAction,
  saveTemplateAction,
  setTemplateActiveAction,
  setTemplateOrderAction,
  setTemplatesActiveAction,
} from './actions'

// Admin-only, request-time page. The proxy (core/auth proxyGate) answers non-admins with a real
// 404 before rendering; requireAdmin() here stays as the authoritative check. noindex comes from
// the (app) layout.
export const instant = false

export const metadata: Metadata = { title: '模板与提示词' }

// The cover tabs (ARCHITECTURE §8.3, T87): the common cover, the site's languages, then the ones
// registered as upcoming. Names in Chinese from the code, so a new language needs no copy.
const zhName = new Intl.DisplayNames(['zh-Hans'], { type: 'language' })
const COVER_LANGUAGES = [
  { code: null, label: '通用', upcoming: false },
  ...site.locales.enabled.map((code) => ({ code, label: zhName.of(code) ?? code, upcoming: false })),
  ...(site.locales.upcoming ?? []).map((code) => ({ code, label: zhName.of(code) ?? code, upcoming: true })),
]

export default async function AdminTemplatesPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [templates, categories, providers] = await Promise.all([listAdminTemplates(db), listAdminCategories(db), readPricingOptions(db)])
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">模板与提示词</h1>
        {/* The built-in photo-edit template is not in this list (ARCHITECTURE §5.2). */}
        <Link href="/admin/templates/edit" className="ml-auto text-sm underline underline-offset-4">
          作品编辑的判断题和约束段落 →
        </Link>
      </div>
      <CategoriesPanel
        categories={categories}
        actions={{ save: saveTemplateCategoryAction, reorder: reorderTemplateCategoriesAction, remove: deleteTemplateCategoryAction }}
      />
      <TemplatesEditor
        templates={templates}
        providers={providers}
        categories={categories}
        floor={pricingFromOptions(providers)}
        coverLanguages={COVER_LANGUAGES}
        actions={{
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
    </div>
  )
}
