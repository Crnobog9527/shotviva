import 'server-only'
import { getMessages } from 'next-intl/server'
import { z } from 'zod'

const agreement = z.object({ version: z.string().min(1), body: z.string().trim().min(1) })

export async function publishedTerms(version: string) {
  const text = agreement.safeParse((await getMessages()).affiliateAgreement)
  return text.success && text.data.version === version ? text.data.body : null
}
