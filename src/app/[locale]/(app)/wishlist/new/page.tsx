import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { isWishlistEligible } from '@/core/wishlist'
import { PostForm } from '@/core/wishlist/ui'
import { PhotoSlot } from '@/modules/image'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.wishlist.new'))('title') }
}

function Head() {
  const t = useTranslations('app.wishlist')
  return (
    <>
      <FlowNav back={{ href: '/wishlist', label: t('title') }} title={t('new.title')} />
      <h1 className="px-4 pt-2 font-display text-h1 leading-tight">{t('new.title')}</h1>
    </>
  )
}

// Request a template, a flow page (DESIGN §4.7). Below the threshold the wall's button is
// greyed; arriving here anyway goes back to the wall (the API refuses as well).
async function Form() {
  const user = await requireUser('/wishlist/new')
  if (!(await isWishlistEligible(createAdminSupabase(), user.id))) redirect(await localized('/wishlist'))
  // The image module's uploader goes in as an element; core may not import a module.
  return <PostForm photoSlot={<PhotoSlot />} />
}

export default function NewRequestPage() {
  return (
    <AppPage>
      <Head />
      <Suspense>
        <Form />
      </Suspense>
    </AppPage>
  )
}
