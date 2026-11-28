import { getTranslations } from 'next-intl/server'

import { TabRootHeader } from '@/core/app-shell'
import { maskPhone } from '@/core/auth/phone'
import { encodeOwnJobsCursor, fileUrlFor, FIRST_SCREEN_THUMBS, firstThumbUrls, listOwnRunning, ownJobsByIds, type OwnJobsCursor } from '@/core/jobs'
import { accountLabels } from '@/core/org/console'
import { listCompanyPhotos, ME, orgWorkMakers, PERSONAL, signedOrgTiles, type CompanyFilter, type CompanySeat } from '@/core/org/works'
import { CompanyFilterRail, DoneGrid, PhotosCount, companyHref, toCompanyItems, toPhotoItem, useCompanyChips, type TemplateLookup } from '@/modules/image'
import { r2Store } from '@/core/storage'
import type { SupabaseClient } from '@supabase/supabase-js'

import { deleteOrgWorkAction } from '../account/enterprise/works/actions'
import { createWorkShareAction } from './share-actions'

type Chips = Parameters<typeof useCompanyChips>
// A hook (translations) needs a component of its own: the rail of whose works to show.
function Rail({ members, me, personal, current }: { members: Chips[0]; me: string; personal: number; current: CompanyFilter }) {
  return <CompanyFilterRail chips={useCompanyChips(members, me, personal)} current={current} />
}

type Props = {
  db: SupabaseClient
  userId: string
  seat: CompanySeat
  now: Date
  timeZone: string
  filter: CompanyFilter
  until: OwnJobsCursor | null
  lookup: TemplateLookup
  liveTemplates: string[]
  covers: Record<string, string | null>
}

// Photos for an active member of an org whose workspace is on (ARCHITECTURE §6.5「作品页就是企业
// 作品」, Owner 2026-11-28): the whole company's works with the reader's own personal ones among
// them, by maker. Every read goes through org_member_photos, which checks the seat and the
// workspace again; the reader's own works are then read in full as their owner. Colleagues' works
// are view and download; deleting them is the org owner's (the action checks ownership again).
export async function CompanyPhotos({ db, userId, seat, now, timeZone, filter, until, lookup, liveTemplates, covers }: Props) {
  const [page, personal, members, runningJobs, tp] = await Promise.all([
    listCompanyPhotos(db, userId, { filter, until }),
    listCompanyPhotos(db, userId, { filter: PERSONAL }).then((list) => list.total),
    orgWorkMakers(db, userId),
    listOwnRunning(db, userId, now),
    getTranslations('app.photos'),
  ])
  const mine = page.works.flatMap((work) => (work.userId === userId ? [work.id] : []))
  // The first screen's tile copies are signed into the page, as on the personal view: the
  // reader's own as their owner, colleagues' through the member check, each only where the tile
  // already exists. The rest go through the routes.
  const first = page.works.slice(0, FIRST_SCREEN_THUMBS)
  const [own, labels, theirTiles] = await Promise.all([
    ownJobsByIds(db, userId, mine),
    accountLabels(db, members.flatMap((m) => (m.userId ? [m.userId] : [])), maskPhone),
    signedOrgTiles({ db, store: r2Store }, userId, first.flatMap((work) => (work.userId && work.userId !== userId && !work.archived ? [work.id] : []))),
  ])
  const firstOwn = new Set(first.flatMap((work) => (work.userId === userId ? [work.id] : [])))
  const myTiles = await firstThumbUrls(r2Store, own.filter((job) => firstOwn.has(job.id)), FIRST_SCREEN_THUMBS, 'tile')
  const signed = new Map([...theirTiles, ...myTiles])
  const fallback = tp('fallbackName')
  const items = toCompanyItems(page.works, { me: userId, own: new Map(own.map((job) => [job.id, job])), templates: lookup, labels, fallbackName: fallback, fileUrlFor, signed })
  // The reader's own photos in flight belong with everyone's works or their own, not under a
  // colleague's (or the archived, or the personal) filter.
  const running = filter === null || filter === ME ? runningJobs.map((job) => toPhotoItem(job, lookup, null, fallback)) : []
  const rail = <Rail members={members.map((m) => ({ ...m, label: m.userId ? (labels.get(m.userId) ?? null) : null }))} me={userId} personal={personal} current={filter} />
  return (
    <>
      <TabRootHeader title={tp('title')} aside={<PhotosCount runningIds={running.map((item) => item.id)} done={page.total} />} />
      <DoneGrid
        items={items}
        now={now}
        timeZone={timeZone}
        running={{ server: running, covers }}
        liveTemplates={liveTemplates}
        share={createWorkShareAction}
        total={page.total}
        more={page.next ? companyHref(filter, encodeOwnJobsCursor(page.next)) : null}
        company={{ filter: rail, emptyNote: tp(filter ? 'company.emptyFilter' : 'company.empty'), remove: seat.owner ? deleteOrgWorkAction : null }}
      />
    </>
  )
}
