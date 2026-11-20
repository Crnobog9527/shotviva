import 'server-only'

import { revalidateTag, updateTag } from 'next/cache'

import { logger } from '../logger'
import { r2ConditionalJson } from '../storage/r2-store'
import { discardCatalogueFlight, waitOutCatalogueFlight } from './catalogue-flight'

async function invalidateCreateCatalogue() {
  try {
    const store = r2ConditionalJson()
    if (store) await discardCatalogueFlight(store)
  } catch (error) {
    logger.error('templates.create_catalogue_invalidation_failed', { error })
    await waitOutCatalogueFlight()
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
