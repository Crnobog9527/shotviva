import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { fileUrlFor, listOwnJobs } from '@/core/jobs'
import { EDIT_TEMPLATE_ID, listTemplates } from '@/core/templates'
import { DoneGrid, PhotosCount, RunningList, toPhotoItem, type TemplateLookup } from '@/modules/image'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.photos'))('metaTitle') }
}

function Header({ aside }: { aside?: ReactNode }) {
  return <TabRootHeader title={useTranslations('app.photos')('title')} aside={aside} />
}

// Photos tab (B comp photos.html): photos still developing, then finished ones.
async function Photos() {
  const user = await requireUser('/photos')
  const supabase = await createServerSupabase()
  const now = new Date()
  const [own, templates] = await Promise.all([listOwnJobs(supabase, user.id, now), listTemplates(supabase, 'web')])
  const tp = await getTranslations('app.photos')
  const fallback = tp('fallbackName')
  const lookup: TemplateLookup = new Map(templates.map((t) => [t.id, { name: t.name, cover: t.coverAfterUrl ?? t.coverPosterUrl }]))
  // Edits run on the built-in `edit` template, which is in no catalogue (ARCHITECTURE §5.2).
  lookup.set(EDIT_TEMPLATE_ID, { name: tp('editedName'), cover: null })
  const running = own.running.map((job) => toPhotoItem(job, lookup, null, fallback))
  const done = own.done.map((job) => toPhotoItem(job, lookup, fileUrlFor(job.id), fallback))
  const covers = Object.fromEntries([...lookup].map(([id, t]) => [id, t.cover]))
  return (
    <>
      <Header aside={<PhotosCount runningIds={running.map((item) => item.id)} done={done.length} />} />
      <RunningList server={running} covers={covers} />
      <DoneGrid items={done} now={now} anyRunning={running.length > 0} />
    </>
  )
}

export default function PhotosPage() {
  return (
    <AppPage>
      <Suspense fallback={<Header />}>
        <Photos />
      </Suspense>
    </AppPage>
  )
}
