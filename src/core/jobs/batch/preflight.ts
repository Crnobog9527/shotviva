import 'server-only'
import { readBatchPromoAllowed } from '@/core/org/batch-promo'
import { readPoolChoiceOffer } from '@/core/org/pool-choice'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { MAX_BATCH_SIZE, readBalance } from '../../billing'
import { orgBalance, tierPool, type Balance, type CreditPool, type PoolChoiceOffer } from '../../billing/pools'
import { accountLimits } from '../account-limits'
import { AppError } from '../../errors'
import { isOwnInputKey } from '../../storage'
import { allowedWebAspects, assertPricedTier, hasSlots, assertTemplateQuote, loadGenerationTemplate, validateGenerationInputs, type Template } from '../../templates'
import { generateBodySchema, toGenerationRequest } from '../generation-request'
import type { TemplateProvider } from '../provider'
import { assertBatchRoutes, BatchTemplateError, quoteBatchRoute } from './sale'
import { assertBatchAllowed } from './limits'
import { signCell } from './proof'

const cell = generateBodySchema.pick({ template_id: true, inputs: true, expected_credits: true }).extend({
  input_key: z.string().min(1).max(200), photo_name: z.string().trim().min(1).max(255),
})
export const preflightSchema = z.object({ cells: z.array(cell).min(1).max(MAX_BATCH_SIZE) })
type Selected = z.infer<typeof cell>

function checkGrid(userId: string, cells: Selected[], promo: boolean) {
  if (cells.some(c => !isOwnInputKey(userId, c.input_key))) throw new AppError('INVALID_INPUT', 'Unknown upload')
  if (new Set(cells.map(c => JSON.stringify([c.template_id, c.input_key]))).size !== cells.length) {
    throw new AppError('INVALID_INPUT', 'Duplicate grid cell')
  }
  // One size for the whole batch; each cell may pick its own tier (Owner 2026-11-28).
  if (new Set(cells.map(c => c.inputs.aspect_ratio ?? 'original')).size > 1) {
    throw new AppError('INVALID_INPUT', 'Use one aspect ratio across the batch')
  }
  // 1K is free credits only (1996), and a batch takes free credits only from an affiliate org's
  // promotion share (2036): reserve_batch_cell would refuse anyone else's 1K cell, so say so first.
  if (!promo && cells.some(c => tierPool(c.inputs.resolution ?? '1k') === 'free')) {
    throw new AppError('INVALID_INPUT', 'A batch is paid credits only: pick 2K or 4K')
  }
}

// What the batch needs from each pool against what the account can spend there: an active member
// spends the org's shares only (§6.5, 1897), promotion as the free pool.
function assertCovered(quotes: { pool: CreditPool; price: { expected_credits: number } }[], balance: Balance, offer: PoolChoiceOffer | null) {
  const need = { paid: 0, free: 0 }
  for (const q of quotes) need[q.pool] += q.price.expected_credits
  const have = offer ? orgBalance(offer) : balance
  if (need.paid > have.paid || need.free > have.free) throw new AppError('CREDITS_INSUFFICIENT', 'Credits do not cover this batch')
}

function quote(userId: string, selected: Selected, template: Template, position: number,
  batch: { batch_id: string; batch_size: number; batch_templates: number }) {
  // A slot template is single-run only (§5.1e, 总控 2026-11-12): never part of a batch.
  if (hasSlots(template.fields)) throw new AppError('INVALID_INPUT', 'This template makes one image at a time')
  const resolution = selected.inputs.resolution ?? '1k'
  assertPricedTier(template.unpricedResolutions, resolution)
  const expected_credits = template.creditsCost[resolution]
  assertTemplateQuote(selected.expected_credits, expected_credits)
  const req = toGenerationRequest(userId, { ...selected, ...batch, expected_credits })
  const inputs = validateGenerationInputs(template.fields, { ...req, imageCount: 1, aspects: allowedWebAspects(template.imageOptions, resolution) })
  if (inputs.aspectRatio !== (req.aspectRatio ?? 'original')) throw new AppError('INVALID_INPUT', 'Select a supported batch aspect ratio')
  const names = { position, photo_name: selected.photo_name, template_name: template.name }
  return { toggles: JSON.stringify(inputs.toggles), pool: tierPool(resolution),
    price: { expected_credits, batch_cell: { ...names, signature: signCell(req, names) } } }
}

type Batch = { batch_id: string; batch_size: number; batch_templates: number }
type Selection = { selected: Selected; position: number }

// One template's cells: each quoted and signed, the same options for all its photos, and a route
// for every tier its cells use (they may differ, Owner 2026-11-28).
async function quoteTemplate(db: SupabaseClient, userId: string, id: string, selected: Selection[], batch: Batch, provider: TemplateProvider) {
  try {
    const loaded = await loadGenerationTemplate(db, id, 'web')
    const quotes = selected.map(c => quote(userId, c.selected, loaded.template, c.position, batch))
    if (new Set(quotes.map(q => q.toggles)).size > 1) {
      throw new AppError('INVALID_INPUT', 'Use the same options for each photo of a template')
    }
    const aspect = selected[0]!.selected.inputs.aspect_ratio ?? 'original'
    const tiers = [...new Set(selected.map(c => c.selected.inputs.resolution ?? '1k'))]
    const routes = await Promise.all(tiers.map(tier => quoteBatchRoute(provider, loaded, tier, aspect)))
    return { routes, quotes }
  } catch (error) {
    if (error instanceof AppError && error.code !== 'INTERNAL') {
      throw new BatchTemplateError(id, error.code === 'NOT_FOUND' ? undefined : error)
    }
    throw error
  }
}

export async function preflightBatch(db: SupabaseClient, userId: string, cells: Selected[], provider: TemplateProvider) {
  const ids = [...new Set(cells.map(c => c.template_id))]
  const [limits, promo] = await Promise.all([accountLimits(db, userId), readBatchPromoAllowed(db, userId)])
  assertBatchAllowed(limits, cells.length, ids.length)
  checkGrid(userId, cells, promo)
  const batch = { batch_id: randomUUID(), batch_size: cells.length, batch_templates: ids.length }
  const selections = cells.map((selected, i) => ({ selected, position: i + 1 }))
  const [groups, balance, offer] = await Promise.all([
    Promise.all(ids.map(id => quoteTemplate(db, userId, id, selections.filter(c => c.selected.template_id === id), batch, provider))),
    readBalance(db, userId),
    readPoolChoiceOffer(db, userId),
  ])
  await assertBatchRoutes(db, groups.flatMap(group => group.routes))
  const quotes = groups.flatMap(group => group.quotes)
  assertCovered(quotes, balance, offer)
  const prices = quotes.map(q => q.price).sort((a, b) => a.batch_cell.position - b.batch_cell.position)
  const total_credits = prices.reduce((sum, c) => sum + c.expected_credits, 0)
  return { ...batch, total_credits, cells: prices }
}
