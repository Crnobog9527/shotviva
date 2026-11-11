import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PhotosScreen } from '../photos-screen'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.photos'))('metaTitle') }
}

// One work's address (a link, a refresh, Back): Photos with that work open in the viewer over
// it (Owner 2026-11-12: no separate page). The viewer reads the work from the path; a work that
// is not there shows "not found" in the viewer, over the grid. The marker makes the desktop tab
// bar's stand-in hold its 56px while the bar waits for this dynamic path (core/app-shell
// TabBarSlot, globals-body.css).
export default function WorkPage({ params }: PageProps<'/[locale]/photos/[jobId]'>) {
  return <PhotosScreen back={params.then(({ jobId }) => `/photos/${jobId}`)} extra={<span hidden data-under-tabbar="" />} />
}
