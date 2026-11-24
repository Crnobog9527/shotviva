import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheLife, cacheTag } from 'next/cache'

import { bearerClient } from '../auth/bearer-client'
import { createAdminSupabase } from '../auth/supabase-admin'
import { serverEnv } from '../env'
import { AppError } from '../errors'
import type { Locale } from '../i18n'
import { logger } from '../logger'
import { publicEnv } from '../public-env'
import { WISHLIST_WALL_TAG } from './wall'
import { PUBLIC_SHIPPED_MAX, PUBLIC_WANTED_MAX, toPublicWall, type PublicWall, type PublicWallRow, type TemplateNameRow } from './public-wall-shape'

// The public /template-requests page's two lists (Owner 2026-11-25): the most-voted live requests
// and the most recently shipped ones. Text only: the description, the status and the vote count.
// No reference photos and no author label leave the signed-in wall; a shipped request names its
// template only when anyone could open it (templates' RLS, read on an anonymous client).
//
// Shared and cached like the wall's first page (WISHLIST_WALL_TAG): a vote or an admin review
// expires it, otherwise it is fresh for an hour. Never throws: null when it cannot be read (a build
// without the database key, an outage), and the page then shows its lists empty.

const COLUMNS = 'id, description, status, votes_count, template_id'

async function wanted(db: SupabaseClient): Promise<PublicWallRow[]> {
  const { data, error } = await db
    .from('template_requests')
    .select(COLUMNS)
    .eq('status', 'live')
    .order('votes_count', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PUBLIC_WANTED_MAX)
    .returns<PublicWallRow[]>()
  if (error) throw new AppError('INTERNAL', `public wall (live) failed: ${error.message}`)
  return data
}

async function shipped(db: SupabaseClient): Promise<PublicWallRow[]> {
  const { data, error } = await db
    .from('template_requests')
    .select(COLUMNS)
    .eq('status', 'shipped')
    .order('reviewed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PUBLIC_SHIPPED_MAX)
    .returns<PublicWallRow[]>()
  if (error) throw new AppError('INTERNAL', `public wall (shipped) failed: ${error.message}`)
  return data
}

async function visibleTemplates(ids: string[]): Promise<TemplateNameRow[]> {
  if (ids.length === 0) return []
  const anon = bearerClient({ url: publicEnv.NEXT_PUBLIC_SUPABASE_URL, anonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY }, null)
  const { data, error } = await anon.from('templates').select('id, name, translations').in('id', ids).returns<TemplateNameRow[]>()
  if (error) throw new AppError('INTERNAL', `public wall template names failed: ${error.message}`)
  return data
}

export async function cachedPublicWall(locale: Locale): Promise<PublicWall | null> {
  'use cache'
  cacheTag(WISHLIST_WALL_TAG)
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 })
    return null
  }
  try {
    const db = createAdminSupabase()
    const [live, built] = await Promise.all([wanted(db), shipped(db)])
    const templates = await visibleTemplates([...new Set(built.flatMap((row) => (row.template_id ? [row.template_id] : [])))])
    cacheLife('hours')
    return toPublicWall(live, built, templates, locale)
  } catch (error) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 })
    logger.error('wishlist.public_wall_failed', { error })
    return null
  }
}
