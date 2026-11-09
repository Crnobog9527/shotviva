import 'server-only'

import { z } from 'zod'

import type { ProviderUsage } from '@/core/jobs'
import { logger } from '@/core/logger'

const money = z.number().finite().nonnegative()
const id = z.string().regex(/^gen-[a-zA-Z0-9_-]{1,160}$/)
const tokens = z.number().int().nonnegative().optional().catch(undefined)
const fields = z.object({
  prompt_tokens: tokens, completion_tokens: tokens,
  cost: money.optional().catch(undefined),
  is_byok: z.boolean().optional().catch(undefined),
  cost_details: z.object({ upstream_inference_cost: money.nullish() }).nullish().catch(undefined),
})
const envelope = z.object({ usage: fields.nullish().catch(undefined), id: id.optional().catch(undefined) })
const metadata = z.object({ data: z.object({
  id, total_cost: money, is_byok: z.boolean(), upstream_inference_cost: money.nullish(),
}) })

export type ReceiptSource = { baseUrl: string; apiKey: string; model: string; fetch?: typeof fetch }

async function lookup(source: ReceiptSource, generationId: string) {
  // Use only the configured provider and its own key; never follow a URL from the response.
  try {
    const response = await (source.fetch ?? fetch)(source.baseUrl + '/generation?id=' + encodeURIComponent(generationId), {
      method: 'GET', headers: { Authorization: 'Bearer ' + source.apiKey }, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok) { await response.body?.cancel(); return null }
    const result = metadata.safeParse(await response.json())
    return result.success && result.data.data.id === generationId ? result.data.data : null
  } catch { return null }
}

export function reportedUsage(body: unknown, headers: Headers): ProviderUsage {
  const parsed = envelope.safeParse(body).data
  const { cost_details, ...reported } = parsed?.usage ?? {}
  const usage: ProviderUsage = { ...reported, cost: reported.cost ?? null }
  const upstream = cost_details?.upstream_inference_cost
  if (upstream != null) usage.upstream_inference_cost = upstream
  const generationId = parsed?.id ?? id.safeParse(headers.get('x-generation-id')).data
  if (generationId) usage.generation_id = generationId
  return usage
}

function mergeReceipt(usage: ProviderUsage, receipt: z.infer<typeof metadata>['data']) {
  if (usage.cost == null) {
    usage.cost = receipt.total_cost
    usage.cost_source = 'generation'
  }
  usage.is_byok ??= receipt.is_byok
  if (receipt.upstream_inference_cost != null) usage.upstream_inference_cost ??= receipt.upstream_inference_cost
}

export async function completeReceipt(usage: ProviderUsage, source: ReceiptSource): Promise<ProviderUsage> {
  if (usage.generation_id && (usage.cost === null || usage.is_byok === undefined)) {
    const receipt = await lookup(source, usage.generation_id)
    if (receipt) mergeReceipt(usage, receipt)
  }
  if (usage.cost === null) logger.warn('openrouter omitted cost; invoice pending', { model: source.model })
  return usage
}
