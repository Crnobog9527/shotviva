import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, TabRootHeader } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { readBalance } from '@/core/billing'
import { currentLocale } from '@/core/i18n/server'
import { listTemplatesIn } from '@/core/templates'
import { GeneratingPill, TemplateCatalogue, toCatalogueTemplate } from '@/modules/image'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.create'))('metaTitle') }
}

function Header({ aside }: { aside?: ReactNode }) {
  const t = useTranslations('app.create')
  return <TabRootHeader title={t('title')} lede={t('lede')} aside={aside} />
}

// Create tab (DESIGN §8.2, B comp create.html): the template catalogue with the balance chip.
async function Create() {
  const user = await requireUser('/generate')
  const supabase = await createServerSupabase()
  const [templates, balance] = await Promise.all([listTemplatesIn(supabase, await currentLocale()), readBalance(supabase, user.id)])
  return (
    <>
      <Header
        aside={
          <>
            <GeneratingPill />
            <BalanceChip balance={balance} />
          </>
        }
      />
      <TemplateCatalogue templates={templates.map(toCatalogueTemplate)} />
    </>
  )
}

export default function CreatePage() {
  return (
    <AppPage>
      <Suspense fallback={<Header />}>
        <Create />
      </Suspense>
    </AppPage>
  )
}
