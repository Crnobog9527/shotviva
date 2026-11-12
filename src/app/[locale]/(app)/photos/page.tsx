import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { DeletedToast } from '@/modules/image'

import { PhotosScreen } from './photos-screen'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.photos'))('metaTitle') }
}

// ?deleted=1: back from deleting a work (T41).
async function Deleted({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (await searchParams).deleted === '1' ? <DeletedToast /> : null
}

export default function PhotosPage({ searchParams }: PageProps<'/[locale]/photos'>) {
  return (
    <PhotosScreen
      back="/photos"
      extra={
        <Suspense>
          <Deleted searchParams={searchParams} />
        </Suspense>
      }
    />
  )
}
