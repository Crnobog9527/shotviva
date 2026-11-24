import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import { bearerClient } from '../auth/bearer-client'
import { createAdminSupabase } from '../auth/supabase-admin'
import { serverEnv } from '../env'
import { AppError } from '../errors'
import type { Locale } from '../i18n'
import { logger } from '../logger'
import { publicEnv } from '../public-env'
import { shippedTemplates, type ShippedRow, type ShippedTemplate, type TemplateNameRow } from './public-wall-shape'
import { WISHLIST_WALL_TAG } from './wall'

// "Recently built from requests" on the public /template-requests page: the templates the latest
// shipped requests became, by name (Owner 2026-11-25). Only `template_id` is read from the
// requests, never their text, photos or author; the names come from an anonymous read, so only
// templates anyone may open are listed. Expired with the wall (WISHLIST_WALL_TAG) when an admin
// ships a request, otherwise fresh for an hour. Never throws: an empty list when it cannot be read.

// A few spare rows so repeats (two requests shipped as one template) still fill the section.
const READ_ROWS = 18

async function latestShipped(): Promise<ShippedRow[]> {
  const { data, error } = await createAdminSupabase()
    .from('template_requests')
    .select('template_id')
    .eq('status', 'shipped')
    .order('reviewed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(READ_ROWS)
    .returns<ShippedRow[]>()
  if (error) throw new AppError('INTERNAL', `shipped templates failed: ${error.message}`)
  return data
}

async function visibleTemplates(ids: string[]): Promise<TemplateNameRow[]> {
  if (ids.length === 0) return []
  const anon = bearerClient({ url: publicEnv.NEXT_PUBLIC_SUPABASE_URL, anonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY }, null)
  const { data, error } = await anon.from('templates').select('id, name, translations').in('id', ids).returns<TemplateNameRow[]>()
  if (error) throw new AppError('INTERNAL', `shipped template names failed: ${error.message}`)
  return data
}

export async function cachedShippedTemplates(locale: Locale): Promise<ShippedTemplate[]> {
  'use cache'
  cacheTag(WISHLIST_WALL_TAG)
  if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 })
    return []
  }
  try {
    const rows = await latestShipped()
    const ids = [...new Set(rows.flatMap((row) => (row.template_id ? [row.template_id] : [])))]
    const list = shippedTemplates(rows, await visibleTemplates(ids), locale)
    cacheLife('hours')
    return list
  } catch (error) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 })
    logger.error('wishlist.shipped_templates_failed', { error })
    return []
  }
}
