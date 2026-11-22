import 'server-only'
import { getMessages } from 'next-intl/server'
import { z } from 'zod'

const agreement = z.object({
  version: z.string().min(1), body: z.string().trim().min(1), earlier: z.record(z.string(), z.string()).optional(),
})

// The published text of the version operations use (affiliate_settings.terms_version): the
// latest, or an earlier one still in force.
export async function publishedTerms(version: string) {
  const text = agreement.safeParse((await getMessages()).affiliateAgreement)
  if (!text.success) return null
  if (text.data.version === version) return text.data.body
  return text.data.earlier?.[version]?.trim() || null
}

// Whether an account must accept the current terms before seeing records: only an active account
// can accept (the database refuses anyone else), so a suspended one keeps its read-only view.
export async function mustAcceptTerms(
  account: { status: string; terms_version: string | null; terms_accepted_at: string | null },
  currentVersion: string,
) {
  if (account.status !== 'active') return false
  if (account.terms_version === currentVersion && account.terms_accepted_at !== null) return false
  return Boolean(await publishedTerms(currentVersion))
}
