import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { formatMoney, listPaymentOptions, listWorkOptions, paymentChoices, workChoices } from '@/core/support'
import { TicketForm } from '@/core/support/ui'
import type { Translate } from '@/core/translate'
import { site } from '@/site/site.config'

import { createTicketAction } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.support.new'))('title') }
}

function Head() {
  const t = useTranslations('app.support')
  return (
    <>
      <FlowNav back={{ href: '/account/help', label: t('title') }} title={t('new.title')} />
      <h1 className="px-4 pt-2 font-display text-h1 leading-tight">{t('new.title')}</h1>
    </>
  )
}

// The pickers list only the author's own payments (service role, filtered by user) and works
// (their own session); the SQL function checks ownership again on submit.
async function Form() {
  const user = await requireUser('/account/help/new')
  const [payments, works, t, locale] = await Promise.all([
    listPaymentOptions(createAdminSupabase(), user.id),
    listWorkOptions(await createServerSupabase(), user.id),
    getTranslations('app.support'),
    getLocale(),
  ])
  const translate = t as unknown as Translate
  return (
    <TicketForm
      submit={createTicketAction}
      payments={paymentChoices(payments, site.billing.products, translate, { money: formatMoney(locale) })}
      works={workChoices(works, translate)}
    />
  )
}

export default function NewTicketPage() {
  return (
    <AppPage>
      <Head />
      <Suspense>
        <Form />
      </Suspense>
    </AppPage>
  )
}
