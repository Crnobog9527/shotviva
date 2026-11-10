import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { currentTier, MAX_BATCH_SIZE, readBalance } from '../../billing'
import { AppError } from '../../errors'
import { isOwnInputKey } from '../../storage'
import { allowedWebAspects, assertPricedTier, assertTemplateQuote, loadGenerationTemplate, validateGenerationInputs, type Template } from '../../templates'
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

function checkGrid(userId: string, cells: Selected[]) {
  if (cells.some(c => !isOwnInputKey(userId, c.input_key))) throw new AppError('INVALID_INPUT', 'Unknown upload')
  if (new Set(cells.map(c => JSON.stringify([c.template_id, c.input_key]))).size !== cells.length) {
    throw new AppError('INVALID_INPUT', 'Duplicate grid cell')
  }
  if (new Set(cells.map(c => JSON.stringify([c.inputs.resolution ?? '1k', c.inputs.aspect_ratio ?? 'original']))).size > 1) {
    throw new AppError('INVALID_INPUT', 'Use one resolution and aspect ratio across the batch')
  }
}

function quote(userId: string, selected: Selected, template: Template, position: number,
  batch: { batch_id: string; batch_size: number; batch_templates: number }) {
  const resolution = selected.inputs.resolution ?? '1k'
  assertPricedTier(template.unpricedResolutions, resolution)
  const expected_credits = template.creditsCost[resolution]
  assertTemplateQuote(selected.expected_credits, expected_credits)
  const req = toGenerationRequest(userId, { ...selected, ...batch, expected_credits })
  const inputs = validateGenerationInputs(template.fields, { ...req, imageCount: 1, aspects: allowedWebAspects(template.imageOptions, resolution) })
  if (inputs.aspectRatio !== (req.aspectRatio ?? 'original')) throw new AppError('INVALID_INPUT', 'Select a supported batch aspect ratio')
  const names = { position, photo_name: selected.photo_name, template_name: template.name }
  return { toggles: JSON.stringify(inputs.toggles),
    price: { expected_credits, batch_cell: { ...names, signature: signCell(req, names) } } }
}

export async function preflightBatch(db: SupabaseClient, userId: string, cells: Selected[], provider: TemplateProvider) {
  const ids = [...new Set(cells.map(c => c.template_id))]
  assertBatchAllowed(await currentTier(db, userId), cells.length, ids.length)
  checkGrid(userId, cells)
  const batch = { batch_id: randomUUID(), batch_size: cells.length, batch_templates: ids.length }
  const selections = cells.map((selected, i) => ({ selected, position: i + 1 }))
  const [groups, balance] = await Promise.all([
    Promise.all(ids.map(async id => {
      try {
        const loaded = await loadGenerationTemplate(db, id, 'web')
        const selected = selections.filter(c => c.selected.template_id === id)
        const quotes = selected.map(c => quote(userId, c.selected, loaded.template, c.position, batch))
        if (new Set(quotes.map(q => q.toggles)).size > 1) {
          throw new AppError('INVALID_INPUT', 'Use the same options for each photo of a template')
        }
        const { resolution = '1k', aspect_ratio = 'original' } = selected[0]!.selected.inputs
        const route = await quoteBatchRoute(provider, loaded, resolution, aspect_ratio)
        return { route, quotes }
      } catch (error) {
        if (error instanceof AppError && error.code !== 'INTERNAL') {
          throw new BatchTemplateError(id, error.code === 'NOT_FOUND' ? undefined : error)
        }
        throw error
      }
    })),
    readBalance(db, userId),
  ])
  await assertBatchRoutes(db, groups.map(group => group.route))
  const prices = groups.flatMap(group => group.quotes.map(q => q.price)).sort((a, b) => a.batch_cell.position - b.batch_cell.position)
  const total_credits = prices.reduce((sum, c) => sum + c.expected_credits, 0)
  if (total_credits > balance.paid) throw new AppError('CREDITS_INSUFFICIENT', 'Paid credits do not cover this batch')
  return { ...batch, total_credits, cells: prices }
}
