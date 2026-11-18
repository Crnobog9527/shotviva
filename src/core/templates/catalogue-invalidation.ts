import 'server-only'

import { revalidateTag, updateTag } from 'next/cache'

import { logger } from '../logger'
import { r2ConditionalJson } from '../storage/r2-store'
import { discardCatalogueFlight } from './catalogue-flight'

async function invalidateCreateCatalogue() {
  try {
    const store = r2ConditionalJson()
    if (store) await discardCatalogueFlight(store)
  } catch (error) {
    // Callers still invalidate the authoritative Next tags. The coordination object only
    // shares a simultaneous fill, so a new fill never serves an earlier completed object.
    logger.error('templates.create_catalogue_invalidation_failed', { error })
  }
}

export async function updateCatalogueTag(tag: string) {
  await invalidateCreateCatalogue()
  updateTag(tag)
}

export async function revalidateCatalogueTag(tag: string) {
  await invalidateCreateCatalogue()
  revalidateTag(tag, { expire: 0 })
}
