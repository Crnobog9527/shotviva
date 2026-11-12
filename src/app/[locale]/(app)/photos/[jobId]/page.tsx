import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { PhotosScreen } from '../photos-screen'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.photos'))('metaTitle') }
}

// Where sign-in returns to. An address that cannot be a work at all (/photos/abc) is the photo
// 404 (not-found.tsx); a well-formed one that is not the caller's work opens the viewer, which
// says so over the grid.
async function backTo(params: PageProps<'/[locale]/photos/[jobId]'>['params']): Promise<string> {
  const { jobId } = await params
  if (!z.uuid().safeParse(jobId).success) notFound()
  return `/photos/${jobId}`
}

// One work's address (a link, a refresh, Back): Photos with that work open in the viewer over
// it (Owner 2026-11-12: no separate page). The viewer reads the work from the path. The marker
// makes the desktop tab bar's stand-in hold its 56px while the bar waits for this dynamic path
// (core/app-shell TabBarSlot, globals-body.css).
export default function WorkPage({ params }: PageProps<'/[locale]/photos/[jobId]'>) {
  return <PhotosScreen back={backTo(params)} extra={<span hidden data-under-tabbar="" />} />
}
