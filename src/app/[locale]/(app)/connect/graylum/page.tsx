import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { switchAccountAction } from '@/app/auth/actions'
import { BalanceChip } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { readBalance } from '@/core/billing'
import { SiteFooter } from '@/core/content'
import { currentLocale, localized } from '@/core/i18n/server'
import { FooterLocales, FooterLocalesFallback } from '@/core/i18n/ui'
import { CONNECT_PAGE_PATH, connectPagePath, parseConnectRequest, readLinkStatus, type ConnectFailureCode } from '@/core/partner'
import { ConnectAllow, ConnectAlready, ConnectError, ConnectShell } from '@/core/partner/ui'
import { footerLinksIn } from '@/site/content'
import { site } from '@/site/site.config'

// The footer is the marketing footer (mk- classes); its styles come with marketing.css.
import '../../../(marketing)/marketing.css'
import './connect.css'

const graylum = site.partners.graylum
// Where "Back to Graylum" goes when there is no valid request to take it from.
const GRAYLUM_HOME = `https://${graylum.returnToHosts[0]}`
const first = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null)
const failureOf = (value: string | null): ConnectFailureCode | null => (value === 'invalid' || value === 'failed' ? value : null)

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('partner.connect'))('title') }
}

// Graylum's "Connect Shotviva" lands here (ARCHITECTURE §14.2, B comp connect.html). An invalid
// link says so before any sign-in; otherwise signed-out users go through sign-in first and come
// back with the same query, then see Allow, or "already connected".
async function Connect({ searchParams }: PageProps<'/[locale]/connect/graylum'>) {
  const params = await searchParams
  const query = { state: first(params.state), return_to: first(params.return_to) }
  const connect = parseConnectRequest(query, graylum)
  const failure = failureOf(first(params.error)) ?? (connect ? null : 'invalid')
  if (!connect || failure) return <Shell email={null}><ConnectError failure={failure ?? 'invalid'} graylumHome={GRAYLUM_HOME} /></Shell>

  const back = connectPagePath(query)
  const user = await requireUser(back)
  const supabase = await createServerSupabase()
  const [link, balance] = await Promise.all([readLinkStatus(supabase, user.id), readBalance(supabase, user.id)])
  const target = { action: await localized(`${CONNECT_PAGE_PATH}/authorize`), state: connect.state, returnTo: query.return_to, graylumHome: connect.callback.origin }
  return (
    <Shell email={user.email}>
      {link.connected && link.linkedAt ? (
        <ConnectAlready target={target} linkedAt={link.linkedAt} />
      ) : (
        <ConnectAllow target={target} email={user.email ?? ''} balance={<BalanceChip balance={balance} />} switchAccount={switchAccountAction.bind(null, back)} />
      )}
    </Shell>
  )
}

async function Shell({ email, children }: { email: string | null; children: React.ReactNode }) {
  const locale = await currentLocale()
  const footer = (
    <SiteFooter
      brand={site.brand}
      links={footerLinksIn(locale)}
      languageSwitch={
        <Suspense fallback={<FooterLocalesFallback />}>
          <FooterLocales translatedPaths={site.locales.zhPaths} />
        </Suspense>
      }
    />
  )
  return (
    <ConnectShell brandName={site.brand.name} email={email} footer={footer}>
      {children}
    </ConnectShell>
  )
}

export default function ConnectGraylumPage(props: PageProps<'/[locale]/connect/graylum'>) {
  return (
    <Suspense>
      <Connect {...props} />
    </Suspense>
  )
}
