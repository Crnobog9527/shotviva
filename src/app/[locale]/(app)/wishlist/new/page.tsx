import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { isWishlistEligible } from '@/core/wishlist'
import { PostForm } from '@/core/wishlist/ui'
import { PhotoTile, UPLOAD_FORMAT_NAMES, UPLOAD_MAX_MB } from '@/modules/image'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.wishlist.new'))('title') }
}

async function Nav() {
  const t = await getTranslations('app.wishlist')
  return <FlowNav back={{ href: '/wishlist', label: t('title') }} title={t('new.title')} pinnedTitle />
}

// Request a template (B comp wishlist.html ?v=request), a flow page. Below the threshold the
// wall's button is greyed; arriving here anyway goes back to the wall (the API refuses as well).
async function Form() {
  const user = await requireUser('/wishlist/new')
  if (!(await isWishlistEligible(createAdminSupabase(), user.id))) redirect(await localized('/wishlist'))
  const formats = (await getFormatter()).list(UPLOAD_FORMAT_NAMES, { type: 'disjunction' })
  // The image module's photo tile goes in as an element; core may not import a module.
  return <PostForm photoTile={<PhotoTile />} uploadRules={{ formats, maxMb: UPLOAD_MAX_MB }} />
}

export default function NewRequestPage() {
  return (
    <AppPage wide>
      <Suspense>
        <Nav />
      </Suspense>
      <Suspense>
        <Form />
      </Suspense>
    </AppPage>
  )
}
