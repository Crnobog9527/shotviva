import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError } from '@/core/errors'
import { effectivePrices } from '@/core/jobs'
import { assertPublicBaseUrl, DEFAULT_BASE_URL, OPENROUTER_BASE_URL, readProviderKey, type AdminProvider } from '@/core/providers'
import { getCatalogJson } from '@/core/providers/catalog-request'

export function isPromptLabVisionProvider(row: AdminProvider) {
  const prices = effectivePrices(row.model, row.prices)
  return row.module === 'decision' && row.adapter === 'openai_responses' && !!row.apiKeyLast4 &&
    prices?.inputTextPerM != null && prices.outputPerM != null && (prices.outputPerM + prices.inputTextPerM > 0)
}

export function supportsVisionModel(raw: unknown, name: string) {
  const catalogue = z.object({ data: z.array(z.object({ id: z.string(), architecture: z.unknown().optional() }).passthrough()) }).safeParse(raw)
  const model = catalogue.data?.data.find(entry => entry.id === name)
  const modes = z.object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) })
    .safeParse(model?.architecture ?? model)
  return !!(modes.data?.input_modalities.includes('image') && modes.data.output_modalities.includes('text'))
}

export async function assertPromptLabVisionCapability(row: AdminProvider, db: SupabaseClient) {
  if (!isPromptLabVisionProvider(row)) throw new AppError('INVALID_INPUT', '请选择已配置密钥和输入输出价格的视觉分析模型')
  const base = await assertPublicBaseUrl(row.baseUrl)
  const official = base === DEFAULT_BASE_URL
  let catalogue: unknown
  try {
    if (official || base === OPENROUTER_BASE_URL) {
      // Public T96-style capability lookup, without sending the provider's Vault credential.
      catalogue = await getCatalogJson(`${OPENROUTER_BASE_URL}/models`)
    } else {
      const key = await readProviderKey(db, row.id)
      if (!key) throw new Error('missing credential')
      const response = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${key}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) { await response.body?.cancel(); throw new Error('catalogue unavailable') }
      catalogue = await response.json()
    }
  } catch {
    throw new AppError('MODEL_INPUT_UNSUPPORTED', '无法读取该供应商的模型能力目录，倒推尚未启用')
  }
  if (!supportsVisionModel(catalogue, official ? `openai/${row.model}` : row.model)) {
    throw new AppError('MODEL_INPUT_UNSUPPORTED', '目录未确认所选模型支持图片输入和文字输出，请换一个模型')
  }
}
