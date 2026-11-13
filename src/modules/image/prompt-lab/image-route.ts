import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/core/errors'
import { providerTag, type GenerationProvider } from '@/core/jobs'
import { findProvider, type AdminProvider } from '@/core/providers'
import type { ImageCapabilities } from '@/core/templates/image-capabilities'
import { imageProvider } from '../provider'
import { estimateRunUsd } from '../test-run/estimate'
import type { RouteFields } from './contracts'

const unavailable = () => new AppError('MODEL_INPUT_UNSUPPORTED', '所选模型不支持当前测试照片、画风参考图或输出规格')

function aspect(caps: ImageCapabilities) {
  if (caps.originalRatio) return 'original'
  if (caps.aspectRatios.includes('1:1')) return '1:1'
  if (caps.aspectRatios[0]) return caps.aspectRatios[0]
  throw unavailable()
}

function routeOptions(row: AdminProvider, selection: RouteFields) {
  const caps = row.capabilities
  if (!caps || row.module !== 'image' || !row.apiKeyLast4) throw unavailable()
  if (!caps.resolutions.includes(selection.resolution) || !row.resolutions.includes(selection.resolution)) throw unavailable()
  const referenceCount = selection.useStyleReference ? 2 : 1
  if (referenceCount < caps.minReferences || referenceCount > caps.maxReferences) throw unavailable()
  return { referenceCount, resolution: selection.resolution, aspectRatio: aspect(caps) }
}

function estimateFor(row: AdminProvider, provider: GenerationProvider, selection: RouteFields) {
  const tier = selection.resolution
  // A manual estimate must not reduce a higher verified catalogue quote.
  const estimate = Math.max(row.estimatedImageCosts?.[tier] ?? 0, row.capabilities?.catalogImageCosts?.[tier] ?? 0,
    row.adapter === 'openai_images' ? estimateRunUsd(tier, selection.quality, provider.prices) : 0)
  if (!estimate || !Number.isFinite(estimate)) throw new AppError('INVALID_INPUT', '当前档位没有可用费用报价')
  return Math.ceil(estimate * 1e6) / 1e6
}

export async function labImageRoute(db: SupabaseClient, selection: RouteFields) {
  const row = await findProvider(db, selection.providerId)
  if (!row) throw unavailable()
  if (row.adapter !== 'openai_images' && selection.quality !== 'medium') throw unavailable()
  const options = routeOptions(row, selection)
  const provider = await imageProvider(row.id, options)
  if (provider.fallbackReason || provider.id !== providerTag(row.id, row.model)) throw unavailable()
  return { provider, aspectRatio: options.aspectRatio, estimate: estimateFor(row, provider, selection) }
}
