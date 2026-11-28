import { getTranslations } from 'next-intl/server'

import { TabRootHeader } from '@/core/app-shell'
import { maskPhone } from '@/core/auth/phone'
import { encodeOwnJobsCursor, fileUrlFor, FIRST_SCREEN_THUMBS, firstThumbUrls, listOwnRunning, ownJobsByIds, type OwnJobsCursor } from '@/core/jobs'
import { accountLabels } from '@/core/org/console'
import { listCompanyPhotoCategories, listCompanyPhotos, ME, orgWorkMakers, PERSONAL, signedOrgTiles, type CompanyFilter, type CompanyPhotoCategory, type CompanySeat } from '@/core/org/works'
import { CompanyCategoryRail, CompanyFilterRail, decodeChips, DoneGrid, encodeChips, PhotosCount, companyHref, toCompanyItems, toPhotoItem, useCompanyChips, type TemplateLookup } from '@/modules/image'
import { logger } from '@/core/logger'
import { r2Store } from '@/core/storage'
import { cachedCategoryTree } from '@/core/templates'
import type { SupabaseClient } from '@supabase/supabase-js'

import { deleteOrgWorkAction } from '../account/enterprise/works/actions'
import { deleteWorksAction } from './actions'
import { createWorkShareAction } from './share-actions'

type Chips = Parameters<typeof useCompanyChips>
// A hook (translations) needs a component of its own: the rail of whose works to show.
function Rail({ members, me, personal, current, category }: { members: Chips[0]; me: string; personal: number; current: CompanyFilter; category: string | null }) {
  return <CompanyFilterRail chips={useCompanyChips(members, me, personal)} current={current} category={category} />
}

// The category chips: every work under "whose works" and each category's count.
type CategoryChips = { total: number; categories: CompanyPhotoCategory[] }

// Read on the first screen only (one aggregate over the scope's works, migration 2040). Load
// more's pages draw the rail from what that read found, carried in the address (`cc`), with the
// names from the shared category tree. null: not known (the read failed, or no usable `cc`); the
// view then lists with no category rail.
async function readChips(db: SupabaseClient, userId: string, filter: CompanyFilter, until: OwnJobsCursor | null, carried: string | undefined): Promise<CategoryChips | null> {
  try {
    if (until === null) {
      const categories = await listCompanyPhotoCategories(db, userId, filter)
      return { total: categories.reduce((sum, c) => sum + c.works, 0), categories }
    }
    const decoded = decodeChips(carried)
    if (!decoded) return null
    const names = new Map((await cachedCategoryTree()).map((node) => [node.key, node]))
    const categories = decoded.chips.flatMap((chip) => {
      const node = names.get(chip.key)
      return node ? [{ key: chip.key, nameEn: node.nameEn, nameZh: node.nameZh, system: false, works: chip.works }] : []
    })
    return { total: decoded.total, categories }
  } catch (error) {
    logger.error('photos.company_categories_failed', { error })
    return null
  }
}

// total: every work under "whose works" (the header). held: how many the category holds (Load
// more). Either is what is listed when nothing better is known.
function counts(pageTotal: number | null, chips: CategoryChips | null, category: string | null, listed: number) {
  const total = pageTotal ?? chips?.total ?? listed
  if (!category) return { total, held: total }
  return { total, held: chips?.categories.find((c) => c.key === category)?.works ?? listed }
}

// What the category rail draws, and the same chips for Load more's address.
function railOf(chips: CategoryChips | null) {
  if (!chips) return { categories: [], railTotal: 0, carry: undefined }
  return { categories: chips.categories, railTotal: chips.total, carry: encodeChips(chips.total, chips.categories.filter((c) => !c.system)) }
}

type Props = {
  db: SupabaseClient
  userId: string
  seat: CompanySeat
  now: Date
  timeZone: string
  filter: CompanyFilter
  // ?category=: one root template category, on top of whose works (migration 2040).
  category: string | null
  // ?cc=: the category chips the first screen read, on Load more's pages.
  carried?: string
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
export async function CompanyPhotos({ db, userId, seat, now, timeZone, filter, category, carried, until, lookup, liveTemplates, covers }: Props) {
  const [page, personal, members, runningJobs, tp, chips] = await Promise.all([
    listCompanyPhotos(db, userId, { filter, until, category }),
    listCompanyPhotos(db, userId, { filter: PERSONAL }).then((list) => list.total ?? 0),
    orgWorkMakers(db, userId),
    listOwnRunning(db, userId, now),
    getTranslations('app.photos'),
    readChips(db, userId, filter, until, carried),
  ])
  const mine = page.works.flatMap((work) => (work.userId === userId ? [work.id] : []))
  // The first screen's tile copies are signed into the page, as on the personal view: the
  // reader's own as their owner, colleagues' through the member check, each only where the tile
  // already exists. The rest go through the routes.
  const first = page.works.slice(0, FIRST_SCREEN_THUMBS)
  const [ownRead, labels, theirTiles] = await Promise.all([
    ownJobsByIds(db, userId, mine),
    accountLabels(db, members.flatMap((m) => (m.userId ? [m.userId] : [])), maskPhone),
    signedOrgTiles({ db, store: r2Store }, userId, first.flatMap((work) => (work.userId && work.userId !== userId && !work.archived ? [work.id] : []))),
  ])
  // ownJobsByIds brings the rest of a batch the page cut. Under a category only the listed works
  // stay: the rest of the batch may be of another category.
  const listedMine = new Set(mine)
  const own = category ? ownRead.filter((job) => listedMine.has(job.id)) : ownRead
  const firstOwn = new Set(first.flatMap((work) => (work.userId === userId ? [work.id] : [])))
  const myTiles = await firstThumbUrls(r2Store, own.filter((job) => firstOwn.has(job.id)), FIRST_SCREEN_THUMBS, 'tile')
  const signed = new Map([...theirTiles, ...myTiles])
  const fallback = tp('fallbackName')
  const items = toCompanyItems(page.works, { me: userId, own: new Map(own.map((job) => [job.id, job])), templates: lookup, labels, fallbackName: fallback, fileUrlFor, signed })
  // The reader's own photos in flight belong with everyone's works or their own. Under any other
  // filter (a colleague, deleted accounts, personal) or under a category the grid shows none at all: not the server's
  // and not the ones this tab started itself, which the client list would otherwise add.
  const narrowed = filter !== null || category !== null
  const showRunning = category === null && (filter === null || filter === ME)
  const running = runningJobs.map((job) => toPhotoItem(job, lookup, null, fallback))
  const rail = <Rail members={members.map((m) => ({ ...m, label: m.userId ? (labels.get(m.userId) ?? null) : null }))} me={userId} personal={personal} current={filter} category={category} />
  const { total, held } = counts(page.total, chips, category, items.length)
  const { categories, railTotal, carry } = railOf(chips)
  return (
    <>
      <TabRootHeader title={tp('title')} aside={<PhotosCount runningIds={running.map((item) => item.id)} done={total} />} />
      <DoneGrid
        items={items}
        now={now}
        timeZone={timeZone}
        running={showRunning ? { server: running, covers } : null}
        liveTemplates={liveTemplates}
        share={createWorkShareAction}
        removeMany={deleteWorksAction}
        total={held}
        more={page.next ? companyHref(filter, encodeOwnJobsCursor(page.next), category, carry) : null}
        rail={{ filter: <>{rail}<CompanyCategoryRail categories={categories} total={railTotal} member={filter} current={category} /></>, emptyNote: tp(narrowed ? 'company.emptyFilter' : 'company.empty'), remove: seat.owner ? deleteOrgWorkAction : null }}
      />
    </>
  )
}
