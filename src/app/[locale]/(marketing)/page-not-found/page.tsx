import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { NotFoundView } from '@/core/content'
import { NOINDEX } from '@/core/seo'

// The 404 page of each language, prerendered as a normal page so its HTML carries the right
// <html lang> and text. The proxy fetches it and answers with status 404 for /zh addresses
// without a Chinese page (core/auth/not-found-page.ts); asked for directly, it is a 404 too.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('notFound'))('title'), robots: NOINDEX }
}

export default function PageNotFound() {
  return <NotFoundView />
}
