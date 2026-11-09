import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { parseMainlandPhone } from '@/core/auth/phone/phone-number'
import { confirmUrl } from '@/core/auth/flows/callback-url'
import { COPY } from './copy'
import { checked } from './read'
import { findUser } from './summary'

export class EnrollmentError extends Error {}

// An unprefixed mainland number can also be the full digits of another country's number.
function phoneQuery(input: string) {
  const compact = input.replace(/[\s()-]/g, '')
  const mainland = parseMainlandPhone(compact)
  if (mainland) return { digits: mainland.digits, search: compact === mainland.national ? mainland.national : mainland.digits }
  const international = /^(?:\+|00)([1-9]\d{6,14})$/.exec(compact)
  if (international) return { digits: international[1], search: international[1] }
  throw new EnrollmentError(COPY.phoneFormat)
}

function matchesPhone(phone: string | null, digits: string, search: string) {
  const stored = phone?.replace(/^\+/, '')
  if (search !== digits && stored === search) throw new EnrollmentError(COPY.phoneAmbiguous)
  return stored === digits
}

const candidates = z.object({ total: z.int().nonnegative(), rows: z.array(z.object({ id: z.uuid(), phone: z.string().nullable() })) })
async function phoneUser(db: SupabaseClient, input: string) {
  const { digits, search } = phoneQuery(input)
  const ids = new Set<string>()
  let count = 0
  for (let page = 1; ; page++) {
    const result = candidates.parse(checked(await db.rpc('admin_list_users', { p_query: '+' + search, p_page: page })))
    for (const row of result.rows) {
      if (matchesPhone(row.phone, digits, search)) ids.add(row.id)
    }
    count += result.rows.length
    if (count >= result.total) break
    if (!result.rows.length) throw new EnrollmentError(COPY.phoneAmbiguous)
  }
  if (ids.size > 1) throw new EnrollmentError(COPY.phoneAmbiguous)
  const [id] = ids
  if (!id) throw new EnrollmentError(COPY.phoneMissing)
  return id
}

export async function resolveAccount(db: SupabaseClient, actor: string, form: FormData) {
  if (form.has('user_id')) {
    if (form.has('account') || form.has('email')) throw new EnrollmentError(COPY.invalid)
    return z.uuid().parse(form.get('user_id'))
  }
  const input = z.string().trim().min(1).max(254).parse(form.get('account') ?? form.get('email'))
  if (!input.includes('@')) return phoneUser(db, input)
  const email = z.email().parse(input.toLowerCase())
  const existing = await findUser(db, actor, email)
  if (existing) return existing.user_id
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: confirmUrl('/partners') })
  if (!error) return data.user.id
  // A competing invitation or signup may have created the account since the exact lookup.
  const winner = await findUser(db, actor, email)
  if (winner) return winner.user_id
  throw new Error('Affiliate invitation failed')
}
