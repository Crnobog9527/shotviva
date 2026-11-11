import { gunzipSync, gzipSync } from 'node:zlib'

import { parseBatch, type Batch, type TemplateItem } from './schema'

// Production gets only the structure of a batch: categories, series, and per template its
// category, series, model, sale and publish state. Template content (fields, prices, prompts,
// covers, style references) reaches production through the T93 sync from the test site. The
// structure travels as a workflow input, which a public repository's run page shows, so it must
// never carry a prompt, a price or a local file.

const STRUCTURE_KEYS = ['id', 'category', 'series', 'model', 'openSale', 'publish', 'unpublishReason'] as const
type StructureItem = Pick<TemplateItem, (typeof STRUCTURE_KEYS)[number]>

export function structureOnly(batch: Batch): Batch {
  const templates = batch.templates.map(item =>
    Object.fromEntries(STRUCTURE_KEYS.filter(key => item[key] !== undefined).map(key => [key, item[key]])) as StructureItem)
  return { categories: batch.categories, referenceCategories: batch.referenceCategories, series: batch.series, templates: templates as TemplateItem[] }
}

export function encodeBatch(batch: Batch): string {
  return gzipSync(Buffer.from(JSON.stringify(structureOnly(batch)))).toString('base64')
}

// Input limit of a workflow_dispatch value is far above any structure batch; refuse anything big.
const MAX_ENCODED = 60_000

export function decodeProductionBatch(encoded: string): Batch {
  if (encoded.length > MAX_ENCODED) throw new Error('BATCH_TOO_LARGE')
  let input: unknown
  try {
    input = JSON.parse(gunzipSync(Buffer.from(encoded.trim(), 'base64')).toString('utf8'))
  } catch {
    throw new Error('BATCH_UNREADABLE')
  }
  const batch = parseBatch(input)
  const extra = batch.templates.find(item => Object.keys(item).some(key => !(STRUCTURE_KEYS as readonly string[]).includes(key)))
  if (extra) throw new Error(`STRUCTURE_ONLY: ${extra.id}`)
  return batch
}
