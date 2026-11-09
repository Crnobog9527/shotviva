import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getSessionUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { ApplicationEntry } from './application-entry'
import { ApplicationStatus } from './application-status'
import { ProgramIntro } from './program-intro'
import { slugSchema, type SearchParams } from './models'
import { readAccount, readOpenEnrollmentSettings } from './repository'

export async function EnrollmentScreen({ search, openForm = false }: { search: Promise<SearchParams>; openForm?: boolean }) {
  await connection()
  const settings = await readOpenEnrollmentSettings()
  if (!settings) return closedEnrollment(openForm)
  const [session, raw] = await Promise.all([getSessionUser(), search])
  const userId = session?.verified ? session.id : undefined
  const account = userId ? await readAccount(userId) : null
  if (account?.status === 'active') redirect(await localized('/partners'))
  if (account) return <ApplicationStatus account={account} />
  const parent = slugSchema.catch('').parse(raw.by)
  return <ProgramIntro><ApplicationEntry userId={userId} parent={parent} openForm={openForm} settings={settings} /></ProgramIntro>
}

function closedEnrollment(openForm: boolean) {
  if (openForm) notFound()
  return <ProgramIntro />
}
