import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AppPage, BalanceChip, TabRootHeader } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { readBalance } from '@/core/billing'
import { listTemplates } from '@/core/templates'
import { GeneratingPill, TemplateCatalogue, toCatalogueTemplate } from '@/modules/image'

export const metadata: Metadata = { title: 'Create' }

const TITLE = 'Create'
const LEDE = 'Pick a look. Your photo stays as shot.'

// Create tab (DESIGN §8.2, B comp create.html): the template catalogue with the balance chip.
async function Create() {
  const user = await requireUser('/generate')
  const supabase = await createServerSupabase()
  const [templates, balance] = await Promise.all([listTemplates(supabase, 'web'), readBalance(supabase, user.id)])
  return (
    <>
      <TabRootHeader
        title={TITLE}
        lede={LEDE}
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
      <Suspense fallback={<TabRootHeader title={TITLE} lede={LEDE} />}>
        <Create />
      </Suspense>
    </AppPage>
  )
}
