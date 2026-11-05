import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { fileUrlFor, listOwnJobs } from '@/core/jobs'
import { listTemplates } from '@/core/templates'
import { DoneGrid, PhotosCount, RunningList, toPhotoItem, type TemplateLookup } from '@/modules/image'

export const metadata: Metadata = { title: 'Photos' }

// Photos tab (B comp photos.html): photos still developing, then finished ones.
async function Photos() {
  const user = await requireUser('/photos')
  const supabase = await createServerSupabase()
  const now = new Date()
  const [own, templates] = await Promise.all([listOwnJobs(supabase, user.id, now), listTemplates(supabase, 'web')])
  const lookup: TemplateLookup = new Map(templates.map((t) => [t.id, { name: t.name, cover: t.coverAfterUrl ?? t.coverPosterUrl }]))
  const running = own.running.map((job) => toPhotoItem(job, lookup, null))
  const done = own.done.map((job) => toPhotoItem(job, lookup, fileUrlFor(job.id)))
  const covers = Object.fromEntries([...lookup].map(([id, t]) => [id, t.cover]))
  return (
    <>
      <TabRootHeader title="Photos" aside={<PhotosCount runningIds={running.map((item) => item.id)} done={done.length} />} />
      <RunningList server={running} covers={covers} />
      <DoneGrid items={done} now={now} anyRunning={running.length > 0} />
    </>
  )
}

export default function PhotosPage() {
  return (
    <AppPage>
      <Suspense fallback={<TabRootHeader title="Photos" />}>
        <Photos />
      </Suspense>
    </AppPage>
  )
}
