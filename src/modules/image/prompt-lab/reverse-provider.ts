import 'server-only'
import { z } from 'zod'
import sharp from 'sharp'
import { AppError } from '@/core/errors'
import { effectivePrices } from '@/core/jobs'
import { OPENROUTER_BASE_URL, type AdminProvider } from '@/core/providers'
import { OPENROUTER_TOP_UP_FACTOR } from '@/core/jobs/openrouter-fee'

const endpoint = (row: AdminProvider) => row.baseUrl.replace(/\/+$/, '')
const maxOutput = 2048
const round = (value: number) => Math.round(value * 1e6) / 1e6
const token = z.int().nonnegative()
const reply = z.object({
  status: z.string().optional(), output: z.array(z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })),
  usage: z.object({ input_tokens: token, output_tokens: token, cost: z.number().nonnegative().nullable().optional(),
    is_byok: z.boolean().optional() }).nullish(),
})

export function reverseEstimate(row: AdminProvider, instruction: string) {
  const prices = effectivePrices(row.model, row.prices)
  if (prices?.inputTextPerM == null || prices.outputPerM == null) throw new AppError('INVALID_INPUT', '倒推模型缺少价格')
  // Conservative quote for one downscaled low-detail image, one instruction and bounded output.
  const imageRate = prices.inputImagePerM ?? prices.inputTextPerM
  const inputCost = (Buffer.byteLength(instruction) + 256) * prices.inputTextPerM + 4096 * imageRate
  const factor = endpoint(row) === OPENROUTER_BASE_URL ? OPENROUTER_TOP_UP_FACTOR : 1
  return Math.ceil((inputCost + maxOutput * prices.outputPerM) * factor) / 1e6
}

export async function visionPreview(bytes: Uint8Array) {
  const image = await sharp(bytes).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).webp().toBuffer()
  return `data:image/webp;base64,${image.toString('base64')}`
}

function actualCost(row: AdminProvider, usage: z.infer<typeof reply>['usage']) {
  if (!usage) return null
  if (endpoint(row) === OPENROUTER_BASE_URL) {
    return usage.cost != null && usage.is_byok === false ? round(usage.cost * OPENROUTER_TOP_UP_FACTOR) : null
  }
  const rates = effectivePrices(row.model, row.prices)
  // Responses reports aggregate input tokens. Separate image pricing cannot be reconstructed.
  if (rates?.inputTextPerM == null || rates.outputPerM == null) return null
  if (rates.inputImagePerM != null && rates.inputImagePerM !== rates.inputTextPerM) return null
  return round((usage.input_tokens * rates.inputTextPerM + usage.output_tokens * rates.outputPerM) / 1e6)
}

export async function requestReverse(row: AdminProvider, key: string, instruction: string, image: string, transport = fetch) {
  const response = await transport(`${endpoint(row)}/responses`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, redirect: 'error',
    cache: 'no-store', signal: AbortSignal.timeout(75_000),
    body: JSON.stringify({ model: row.model, instructions: instruction, store: false, max_output_tokens: maxOutput,
      input: [{ role: 'user', content: [{ type: 'input_image', image_url: image, detail: 'low' }] }] }),
  })
  if (!response.ok) { await response.body?.cancel(); throw new Error('vision request failed') }
  const parsed = reply.safeParse(await response.json())
  if (!parsed.success) throw new Error('invalid vision response')
  const text = parsed.data.output.flatMap(item => item.content ?? []).filter(part => part.type === 'output_text')
    .map(part => part.text ?? '').join('').trim()
  const complete = !parsed.data.status || parsed.data.status === 'completed'
  return { prompt: complete && text.length > 0 && text.length <= 32000 ? text : null, cost: actualCost(row, parsed.data.usage) }
}
