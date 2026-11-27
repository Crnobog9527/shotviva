import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getSessionUser, type SessionUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { ApplicationEntry } from './application-entry'
import { ApplicationPage } from './application-page'
import { ApplicationStatus } from './application-status'
import { ProgramIntro } from './program-intro'
import { slugSchema, type Account, type SearchParams } from './models'
import { isOrgMember, readAccount, readOpenEnrollmentSettings } from './repository'

// `join` is the program page; `apply` is the application itself, for a signed-in account only.
export async function EnrollmentScreen({ search, mode = 'join' }: { search: Promise<SearchParams>; mode?: 'join' | 'apply' }) {
  await connection()
  const settings = await readOpenEnrollmentSettings()
  if (!settings) return closedEnrollment(mode)
  const [session, raw] = await Promise.all([getSessionUser(), search])
  const account = await accountOf(session)
  if (await belongsToOrg(session, account)) redirect(await localized('/partners/enterprise'))
  if (account?.status === 'active') redirect(await localized('/partners'))
  const parent = slugSchema.catch('').parse(raw.by)
  if (account && !reopenedForm(mode, account)) return <ApplicationStatus account={account} parent={parent} />
  if (mode === 'apply') return <ApplicationPage session={session} parent={parent} settings={settings} />
  return <ProgramIntro><ApplicationEntry signedIn={Boolean(session?.verified)} parent={parent} /></ProgramIntro>
}

function reopenedForm(mode: 'join' | 'apply', account: Account) {
  return mode === 'apply' && account.status === 'rejected' && account.reapply_allowed
}

function closedEnrollment(mode: 'join' | 'apply') {
  if (mode === 'apply') notFound()
  return <ProgramIntro />
}

// Org owners and members (and the org account itself) never see the personal program (§6.5).
async function belongsToOrg(session: SessionUser | null, account: Account | null) {
  if (account?.org_id) return true
  return session?.verified ? isOrgMember(session.id) : false
}

async function accountOf(session: SessionUser | null) {
  return session?.verified ? readAccount(session.id) : null
}
