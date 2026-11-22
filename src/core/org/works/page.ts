import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { accountLabels } from '../console/reads'
import { ORG_WORKS_PAGE, orgOwnerWorkMembers, orgOwnerWorks, type OrgWork, type OrgWorkMember } from './reads'

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

// The 企业作品 page for the signed-in owner: who made org works (to filter by), and one page of
// works, each with its maker's account label. A member id that is not one of them shows all.
export async function readOrgWorksPage(
  db: SupabaseClient,
  owner: string,
  query: { member?: string; before?: string },
  maskPhone: (phone: string) => string,
): Promise<OrgWorksPage> {
  const members = await orgOwnerWorkMembers(db, owner)
  const member = members.some((m) => m.userId === query.member) ? (query.member as string) : null
  const page = await orgOwnerWorks(db, owner, { ...(member ? { member } : {}), limit: ORG_WORKS_PAGE + 1, before: parseCursor(query.before) })
  const works = page.slice(0, ORG_WORKS_PAGE)
  const labels = await accountLabels(db, members.map((m) => m.userId), maskPhone)
  return {
    members: members.map((m) => ({ ...m, label: labels.get(m.userId) ?? null })),
    works: works.map((w) => ({ ...w, label: labels.get(w.userId) ?? null })),
    member,
    next: page.length > ORG_WORKS_PAGE ? cursorOf(works[works.length - 1]!) : null,
  }
}
