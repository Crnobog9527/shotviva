import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import type { ObjectStore } from '../storage'
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
