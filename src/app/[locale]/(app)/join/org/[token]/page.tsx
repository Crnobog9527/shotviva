import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { AppPage } from '@/core/app-shell'
import { redirect } from 'next/navigation'

import { createAdminSupabase, getSessionUser, requireUser, signupPath } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { readInviteOrg, readSeatOrgId } from '@/core/org/console'
import { JoinForm } from '@/core/org/ui'

import { joinOrgAction } from '../../../account/org-actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.org.join'))('metaTitle') }
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="hairline-lit mx-(--gutter) mt-8 space-y-3 rounded-panel bg-card p-5">
      <h1 className="text-headline font-semibold tracking-[-0.01em]">{title}</h1>
      <p className="text-label text-muted-foreground">{body}</p>
      {children}
    </section>
  )
}

const linkClass = 'inline-flex min-h-11 items-center text-label font-medium text-primary underline underline-offset-4'

// Staff opening the link signed out usually have no account yet: they go to sign-up (its "sign in"
// link keeps `next`), and come back with ?auto=1 so the join finishes without another click.
async function joiningUser(token: string) {
  const back = `/join/org/${encodeURIComponent(token)}?auto=1`
  if (!(await getSessionUser())) redirect(await localized(signupPath(await localized(back))))
  return requireUser(back)
}

// /join/org/[token] (ARCHITECTURE §6.5, card E4): needs a signed-in account, shows the org, and
// joins on one confirmation (automatic on the way back from sign-up or sign-in). The token is only
// ever matched against orgs.invite_token on the server; a wrong or reset one is the same "no
// longer valid" page.
async function Join({ params, searchParams }: Pick<PageProps<'/[locale]/join/org/[token]'>, 'params' | 'searchParams'>) {
  const [{ token }, query] = await Promise.all([params, searchParams])
  const user = await joiningUser(token)
  const t = await getTranslations('app.org.join')
  const db = createAdminSupabase()
  const [org, seat] = await Promise.all([readInviteOrg(db, token), readSeatOrgId(db, user.id)])
  if (!org) return <Notice title={t('invalidTitle')} body={t('invalidBody')}><Link href="/account" className={linkClass}>{t('toAccount')}</Link></Notice>
  if (org.status !== 'active') return <Notice title={t('suspendedTitle')} body={t('suspendedBody', { org: org.name })}><Link href="/account" className={linkClass}>{t('toAccount')}</Link></Notice>
  if (seat === org.id) return <Notice title={t('alreadyTitle', { org: org.name })} body={t('alreadyBody')}><Link href="/account" className={linkClass}>{t('toAccount')}</Link></Notice>
  if (seat) return <Notice title={t('otherTitle')} body={t('otherBody')}><Link href="/account" className={linkClass}>{t('toAccount')}</Link></Notice>
  return (
    <Notice title={t('title', { org: org.name })} body={t('body')}>
      <JoinForm join={joinOrgAction.bind(null, token)} orgName={org.name} auto={query.auto === '1'} />
    </Notice>
  )
}

export default async function JoinOrgPage({ params, searchParams }: PageProps<'/[locale]/join/org/[token]'>) {
  return (
    <AppPage>
      <Suspense fallback={null}>
        <Join params={params} searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
