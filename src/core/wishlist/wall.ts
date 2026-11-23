import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { serverEnv } from '../env'
import { AppError } from '../errors'
import { logger } from '../logger'
import { r2Store, type ObjectStore } from '../storage'
import { afterTime, afterVotes, decodeTimeCursor, decodeWallCursor, encodeCursor, PAGE_SIZE, type WallCursor } from './cursor'
import { signImages } from './images'
import type { MyRequest, Page, RequestRow, WallCard } from './types'

// Reads run on the viewer's own session client, so RLS decides what exists (ARCHITECTURE
// §15.3): live and shipped for everyone signed in, pending and rejected only for the author.

type WallStatus = WallCard['status']
type WallRow = Pick<RequestRow, 'id' | 'description' | 'author_label' | 'votes_count' | 'image_keys' | 'template_id' | 'created_at'> & {
  status: WallStatus
  templates: { name: string } | null
}

const WALL_COLUMNS = 'id, description, author_label, status, votes_count, image_keys, template_id, created_at, templates(name)'

// One status phase in wall order; each call is one ordered range scan of
// template_requests_wall_idx (status, votes_count desc, created_at desc, id desc).
async function wallPhase(client: SupabaseClient, status: WallStatus, after: WallCursor | null, take: number) {
  let query = client.from('template_requests').select(WALL_COLUMNS).eq('status', status)
  if (after) query = query.or(afterVotes(after))
  const { data, error } = await query
    .order('votes_count', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(take)
    .returns<WallRow[]>()
  if (error) throw new AppError('INTERNAL', `listWall failed: ${error.message}`)
  return data
}

// Shipped first, then live; each by votes, then newest (§15.1). A page that finishes the
// shipped cards tops up from the live ones. Fetching one extra row tells whether more follow.
async function wallRows(client: SupabaseClient, cursor: WallCursor | null): Promise<{ rows: WallRow[]; more: boolean }> {
  const rows: WallRow[] = []
  if (cursor?.s !== 'live') {
    const shipped = await wallPhase(client, 'shipped', cursor, PAGE_SIZE + 1)
    if (shipped.length > PAGE_SIZE) return { rows: shipped.slice(0, PAGE_SIZE), more: true }
    rows.push(...shipped)
  }
  const room = PAGE_SIZE - rows.length
  const live = await wallPhase(client, 'live', cursor?.s === 'live' ? cursor : null, room + 1)
  return { rows: [...rows, ...live.slice(0, room)], more: live.length > room }
}

export async function listWall(client: SupabaseClient, store: ObjectStore, rawCursor?: string | null): Promise<Page<WallCard>> {
  const { rows, more } = await wallRows(client, decodeWallCursor(rawCursor))
  const voted = await ownVotes(client, rows.map((row) => row.id))
  const items = await Promise.all(rows.map(async (row) => toCard(row, voted.has(row.id), await signImages(store, row.image_keys))))
  const last = rows.at(-1)
  const nextCursor = more && last ? encodeCursor({ s: last.status, v: last.votes_count, c: last.created_at, i: last.id }) : null
  return { items, nextCursor }
}

// The wall's first page as everyone signed in sees it (the wall lists only live and shipped
// requests, the same for every account), without the viewer's own votes, which the page streams
// after it. Shared and cached so it can be in the page's App Shell: a tab-bar link prefetches it
// and the first tap on the wishlist shows it at once instead of after a cross-border request
// (Owner 2026-11-24). Fresh for 5 minutes (the App Shell keeps only content cached that long),
// kept 30 at most, well inside the 60-minute life of its signed image links. A vote or an admin
// review expires it (expireWallCache). Inside its own cache scope it never throws: null, kept a
// minute, when it cannot be read (a build without the database key, an outage); the page then
// reads the wall at request time as before.
export const WISHLIST_WALL_TAG = 'wishlist-wall'
export type SharedWall = { page: Page<WallCard>; at: string }

export async function cachedWallFirstPage(): Promise<SharedWall | null> {
  'use cache'
  cacheTag(WISHLIST_WALL_TAG)
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 })
    return null
  }
  try {
    const store = r2Store()
    const { rows, more } = await wallRows(createAdminSupabase(), null)
    const items = await Promise.all(rows.map(async (row) => toCard(row, false, await signImages(store, row.image_keys))))
    const last = rows.at(-1)
    const nextCursor = more && last ? encodeCursor({ s: last.status, v: last.votes_count, c: last.created_at, i: last.id }) : null
    cacheLife({ stale: 300, revalidate: 300, expire: 1800 })
    return { page: { items, nextCursor }, at: new Date().toISOString() }
  } catch (error) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 })
    logger.error('wishlist.shared_wall_failed', { error })
    return null
  }
}

// The viewer's votes among the shared first page (RLS keeps the lookup to their own rows).
export function ownVotesAmong(client: SupabaseClient, ids: string[]): Promise<Set<string>> {
  return ownVotes(client, ids)
}

// After anything that changes what the wall shows (a vote count, an admin review).
export function expireWallCache(): void {
  revalidateTag(WISHLIST_WALL_TAG, { expire: 0 })
}

function toCard(row: WallRow, voted: boolean, imageUrls: string[]): WallCard {
  return {
    id: row.id,
    description: row.description,
    authorLabel: row.author_label,
    status: row.status,
    votesCount: row.votes_count,
    voted,
    template: row.template_id ? { id: row.template_id, name: row.templates?.name ?? row.template_id } : null,
    imageUrls,
    createdAt: row.created_at,
  }
}

// The viewer's votes among this page's cards: RLS keeps it to their own rows, and the
// lookup is by the (request_id, user_id) primary key.
async function ownVotes(client: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data, error } = await client
    .from('template_request_votes')
    .select('request_id')
    .in('request_id', ids)
    .returns<{ request_id: string }[]>()
  if (error) throw new AppError('INTERNAL', `ownVotes failed: ${error.message}`)
  return new Set(data.map((row) => row.request_id))
}

type MyRow = Pick<RequestRow, 'id' | 'description' | 'status' | 'votes_count' | 'template_id' | 'image_keys' | 'created_at'>

// Newest first, 30 a page, on template_requests_user_id_created_at_idx (user_id, created_at desc, id desc).
export async function listMyRequests(
  client: SupabaseClient,
  store: ObjectStore,
  userId: string,
  rawCursor?: string | null,
): Promise<Page<MyRequest>> {
  const cursor = decodeTimeCursor(rawCursor)
  let query = client
    .from('template_requests')
    .select('id, description, status, votes_count, template_id, image_keys, created_at')
    .eq('user_id', userId)
  if (cursor) query = query.or(afterTime(cursor))
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
    .returns<MyRow[]>()
  if (error) throw new AppError('INTERNAL', `listMyRequests failed: ${error.message}`)
  const rows = data.slice(0, PAGE_SIZE)
  const items = await Promise.all(rows.map(async (row) => toMine(row, await signImages(store, row.image_keys))))
  const last = rows.at(-1)
  return { items, nextCursor: data.length > PAGE_SIZE && last ? encodeCursor({ c: last.created_at, i: last.id }) : null }
}

function toMine(row: MyRow, imageUrls: string[]): MyRequest {
  return {
    id: row.id,
    description: row.description,
    status: row.status,
    votesCount: row.votes_count,
    templateId: row.template_id,
    imageUrls,
    createdAt: row.created_at,
  }
}
