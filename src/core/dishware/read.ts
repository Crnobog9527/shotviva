import 'server-only'

import { randomInt } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'

import { createAdminSupabase } from '../auth/supabase-admin'
import { AppError } from '../errors'
import type { ObjectStore } from '../storage'
import type { DishCategory } from '../templates/food-flow'
import { looksAlike } from './alike'
import { DISHWARE_COLUMNS, dishwareRowSchema, toDishwareItem, type DishwareItem } from './types'

// Every admin save or delete expires this tag (updateTag), so a new vessel is picked at once.
export const DISHWARE_CACHE_TAG = 'dishware-library'

// The whole active library (a few dozen rows): a tiny table read in full, cached, and picked from
// in code, so a generation adds no query of its own.
export async function loadActiveDishware(db: SupabaseClient): Promise<DishwareItem[]> {
  const { data, error } = await db.from('dishware_library').select(DISHWARE_COLUMNS).eq('is_active', true).order('category').order('id')
  if (error) throw new AppError('INTERNAL', `dishware read failed: ${error.message}`)
  return z.array(dishwareRowSchema).parse(data).map(toDishwareItem)
}

export async function cachedActiveDishware(): Promise<DishwareItem[]> {
  'use cache'
  cacheTag(DISHWARE_CACHE_TAG)
  cacheLife({ revalidate: 300, expire: 3600 })
  return loadActiveDishware(createAdminSupabase())
}

// A random vessel of the category (Owner: random or rotating), never one that looks like the
// user's own (`userDishware`, the reading's text; looksAlike), or null when none remains.
export function pickVessel(items: readonly DishwareItem[], category: DishCategory, random: (n: number) => number = randomInt, userDishware = ''): DishwareItem | null {
  const pool = items.filter((item) => item.isActive && item.category === category && !looksAlike(item.shape, userDishware))
  return pool.length ? pool[random(pool.length)]! : null
}

// The vessel's stored bytes (already an opaque WebP, see admin.ts). Keys carry a content hash, so
// a few recent ones are kept per process; a failed read stays retryable.
const cache = new WeakMap<ObjectStore, Map<string, Promise<Uint8Array>>>()
const CACHE_ENTRIES = 12

export function readVesselBytes(store: ObjectStore, key: string): Promise<Uint8Array> {
  const entries = cache.get(store) ?? new Map<string, Promise<Uint8Array>>()
  cache.set(store, entries)
  const hit = entries.get(key)
  if (hit) return hit
  if (entries.size >= CACHE_ENTRIES) entries.delete(entries.keys().next().value!)
  const pending = store.get(key).catch((error: unknown) => {
    entries.delete(key)
    throw error
  })
  entries.set(key, pending)
  return pending
}
