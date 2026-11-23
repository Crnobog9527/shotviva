import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { accountLabels } from '../console/reads'
import { DELETED_MAKERS } from './makers'
import { ORG_WORKS_PAGE, orgWorkMakers, orgWorks, type OrgWork, type OrgWorkMember } from './reads'

export type OrgWorksPage = {
  members: (OrgWorkMember & { label: string | null })[]
  works: (OrgWork & { label: string | null })[]
  member: string | null
  // The cursor of the next (older) page, or null when this is the last one.
  next: string | null
}

const cursor = z.string().regex(/^[^,]+,[0-9a-f-]{36}$/i)

// `before` in the address is `<created_at>,<id>` of the last work shown.
export const cursorOf = (work: Pick<OrgWork, 'createdAt' | 'id'>) => `${work.createdAt},${work.id}`

function parseCursor(value: string | undefined): { at: string; id: string } | undefined {
  if (!value || !cursor.safeParse(value).success) return undefined
  const at = value.slice(0, value.lastIndexOf(','))
  return Number.isNaN(Date.parse(at)) ? undefined : { at, id: value.slice(value.lastIndexOf(',') + 1) }
}

// The 企业作品 page for the signed-in member of the org (owner or staff): who made org works (to filter by), and one page of
// works, each with its maker's account label. A member id that is not one of them shows all;
// DELETED_MAKERS shows the works of deleted accounts.
export async function readOrgWorksPage(
  db: SupabaseClient,
  user: string,
  query: { member?: string; before?: string },
  maskPhone: (phone: string) => string,
): Promise<OrgWorksPage> {
  const members = await orgWorkMakers(db, user)
  const known = (m: OrgWorkMember) => (m.userId ?? DELETED_MAKERS) === query.member
  const member = members.some(known) ? (query.member as string) : null
  const page = await orgWorks(db, user, { ...(member ? { member } : {}), limit: ORG_WORKS_PAGE + 1, before: parseCursor(query.before) })
  const works = page.slice(0, ORG_WORKS_PAGE)
  const labels = await accountLabels(db, members.flatMap((m) => (m.userId ? [m.userId] : [])), maskPhone)
  const label = (id: string | null) => (id ? (labels.get(id) ?? null) : null)
  return {
    members: members.map((m) => ({ ...m, label: label(m.userId) })),
    works: works.map((w) => ({ ...w, label: label(w.userId) })),
    member,
    next: page.length > ORG_WORKS_PAGE ? cursorOf(works[works.length - 1]!) : null,
  }
}
