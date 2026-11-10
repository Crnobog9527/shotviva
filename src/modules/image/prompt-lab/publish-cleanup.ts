import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/core/logger'
import { removeCreated, type Created, type PublishStores } from './publish-objects'

type Deps = PublishStores & { db: SupabaseClient }
type Row = {
  cover_before_url: string | null; cover_after_url: string | null; cover_video_url: string | null; cover_poster_url: string | null
  cover_locales: unknown; template_prompts: { style_refs: unknown } | null
}

// Every string in the row that is one of our object keys, whether stored as a URL or a key.
function referenced(row: Row, base: string): Set<string> {
  const keys = new Set<string>()
  const walk = (value: unknown) => {
    if (typeof value === 'string') keys.add(value.startsWith(base + '/') ? value.slice(base.length + 1) : value)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(row)
  return keys
}

// The template now holding this id, or undefined when the read itself failed.
async function holder(db: SupabaseClient, id: string): Promise<Row | null | undefined> {
  const { data, error } = await db.from('templates')
    .select('cover_before_url,cover_after_url,cover_video_url,cover_poster_url,cover_locales,template_prompts(style_refs)')
    .eq('id', id).maybeSingle<Row>()
  return error ? undefined : data
}

// Covers are content-hashed, so a concurrent publish under the same id can write the very same key,
// and HEAD-then-PUT is not exclusive. Whatever happened, a template that holds the id keeps every
// object it references: only our unreferenced writes go (our random style-ref key, a result cover
// no other run produced). With no template, a known rollback removes all our writes; an unknown
// outcome keeps them, since a commit still in flight could reference them.
export async function cleanAfterFailure(deps: Deps, id: string, created: Created[], outcome: 'rolled-back' | 'unknown') {
  if (!created.length) return
  const row = await holder(deps.db, id)
  if (row === undefined || (row === null && outcome === 'unknown')) {
    logger.warn('prompt_lab.publish_objects_kept', { templateId: id, count: created.length, outcome })
    return
  }
  const keep = row ? referenced(row, deps.assetsBaseUrl) : new Set<string>()
  await removeCreated(deps, created.filter(item => !keep.has(item.key)))
}
