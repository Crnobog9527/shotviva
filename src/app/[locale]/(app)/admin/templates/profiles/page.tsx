import type { Metadata } from 'next'

import { pricingFromOptions } from '@/core/admin/templates/provider-pricing'
import { listAdminCategoryTree } from '@/core/admin/template-categories'
import { categoryChoices } from '@/core/admin/templates-editor'
import { profileCopy, ProfilesPage } from '@/core/admin/template-profiles'
import { listImageModels, listProfileTemplates, profilesInstalled, readProfileDrift } from '@/core/admin/template-profiles/repository'
import { listAdminSeriesOptions } from '@/core/admin/template-series'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { readPricingOptions } from '@/site/template-pricing'

import { profileDetailAction, saveProfileAction, switchProfilesAction } from './actions'

// Admin-only, request-time page (the proxy 404s non-admins first; requireAdmin() stays the check).
export const instant = false
export const metadata: Metadata = { title: profileCopy.title }

export default async function AdminTemplateProfilesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin()
  const q = (await searchParams).q
  const initialFilter = typeof q === 'string' ? q.slice(0, 64) : ''
  const db = createAdminSupabase()
  if (!(await profilesInstalled(db))) {
    return <p className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">{profileCopy.notInstalled}</p>
  }
  const [templates, models, providers, categories, series, drift] = await Promise.all([
    listProfileTemplates(db), listImageModels(db), readPricingOptions(db), listAdminCategoryTree(db), listAdminSeriesOptions(db), readProfileDrift(db),
  ])
  return (
    <ProfilesPage initialFilter={initialFilter} templates={templates} models={models} floors={pricingFromOptions(providers)} drift={drift}
      categories={categoryChoices(categories).filter(choice => choice.path[0] !== 'art-styles').map(choice => ({ key: choice.key, label: choice.label }))}
      series={series.map(item => ({ key: item.id, label: item.nameZh }))}
      production={serverEnv().VERCEL_ENV === 'production'}
      actions={{ detail: profileDetailAction, save: saveProfileAction, switch: switchProfilesAction }} />
  )
}
