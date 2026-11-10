import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getSessionUser, type SessionUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { ApplicationEntry } from './application-entry'
import { ApplicationPage } from './application-page'
import { ApplicationStatus } from './application-status'
import { ProgramIntro } from './program-intro'
import { slugSchema, type SearchParams } from './models'
import { readAccount, readOpenEnrollmentSettings } from './repository'

// `join` is the program page; `apply` is the application itself, for a signed-in account only.
export async function EnrollmentScreen({ search, mode = 'join' }: { search: Promise<SearchParams>; mode?: 'join' | 'apply' }) {
  await connection()
  const settings = await readOpenEnrollmentSettings()
  if (!settings) return closedEnrollment(mode)
  const [session, raw] = await Promise.all([getSessionUser(), search])
  const account = await accountOf(session)
  if (account?.status === 'active') redirect(await localized('/partners'))
  if (account) return <ApplicationStatus account={account} />
  const parent = slugSchema.catch('').parse(raw.by)
  if (mode === 'apply') return <ApplicationPage session={session} parent={parent} settings={settings} />
  return <ProgramIntro><ApplicationEntry signedIn={Boolean(session?.verified)} parent={parent} /></ProgramIntro>
}

function closedEnrollment(mode: 'join' | 'apply') {
  if (mode === 'apply') notFound()
  return <ProgramIntro />
}

async function accountOf(session: SessionUser | null) {
  return session?.verified ? readAccount(session.id) : null
}
