import type { Metadata } from 'next'

import { AdminPage, EXPERIMENTS_COPY, ExperimentsEditor, loadExperimentViews, type SurfaceChoices } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'
import type { Surface } from '@/core/experiments'
import { experimentRegistry } from '@/site/experiments'

import { actOnExperimentAction, saveExperimentAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §10, §16.5). The admin layout gates it too.
export const instant = false

export const metadata: Metadata = { title: EXPERIMENTS_COPY.title }

// The code's options per surface, and each surface's address for the preview links.
const choices: SurfaceChoices = Object.fromEntries(experimentRegistry.map((route) => [route.surface, route.options]))
const previewPaths: Partial<Record<Surface, string>> = Object.fromEntries(experimentRegistry.map((route) => [route.surface, route.paths[0] ?? '/']))

export default async function AdminExperimentsPage() {
  await requireAdmin()
  const views = await loadExperimentViews(createAdminSupabase(), serverEnv().VERCEL_ENV === 'production')
  return (
    <AdminPage title={EXPERIMENTS_COPY.title}>
      <ExperimentsEditor views={views} choices={choices} previewPaths={previewPaths} actions={{ save: saveExperimentAction, act: actOnExperimentAction }} />
    </AdminPage>
  )
}
