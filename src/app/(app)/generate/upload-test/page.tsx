import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { createServerSupabase, requireUser } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { listTemplates, OUTPUT_ASPECTS } from '@/core/templates'
import { UploadTestPanel } from '@/modules/image'

// TEMPORARY T4 validation harness for Codex (upload → generate → download on real phones).
// Not the workspace (T8 replaces and deletes it). 404 on production deployments.
async function Harness() {
  if (serverEnv().VERCEL_ENV === 'production') notFound()
  await requireUser('/generate/upload-test')
  const templates = await listTemplates(await createServerSupabase(), 'web')
  const options = templates.map((template) => ({
    id: template.id,
    name: template.name,
    // The web offers the eight output sizes whatever the template lists (DESIGN §4.3).
    aspectRatios: [...OUTPUT_ASPECTS],
    copyKeys: template.fields.copy.map((field) => field.key),
  }))
  return <UploadTestPanel templates={options} />
}

export default function UploadTestPage() {
  return (
    <Suspense>
      <Harness />
    </Suspense>
  )
}
