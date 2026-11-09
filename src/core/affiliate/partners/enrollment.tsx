import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getSessionUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { isAffiliateEnabled } from '../feature'
import { ApplicationEntry } from './application-entry'
import { ApplicationStatus } from './application-status'
import { ProgramIntro } from './program-intro'
import { slugSchema, type SearchParams } from './models'
import { readAccount, readSettings } from './repository'
import { publishedTerms } from './terms'

export async function EnrollmentScreen({ search, openForm = false }: { search: Promise<SearchParams>; openForm?: boolean }) {
  await connection()
  if (!(await isAffiliateEnabled())) return closedEnrollment(openForm)
  const [session, raw] = await Promise.all([getSessionUser(), search])
  const userId = session?.verified ? session.id : undefined
  const account = userId ? await readAccount(userId) : null
  if (account?.status === 'active') redirect(await localized('/partners'))
  if (account) return <ApplicationStatus account={account} />
  const settings = await readSettings()
  if (!(await publishedTerms(settings.terms_version))) return closedEnrollment(openForm)
  const parent = slugSchema.catch('').parse(raw.by)
  return <ProgramIntro><ApplicationEntry userId={userId} parent={parent} openForm={openForm} settings={settings} /></ProgramIntro>
}

function closedEnrollment(openForm: boolean) {
  if (openForm) notFound()
  return <ProgramIntro />
}
