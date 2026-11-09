import { z } from 'zod'

import { OPENAI_MAX_REFERENCES } from '@/core/templates/image-capabilities'
import { templateInputSchema } from '@/core/templates/schema'
import type { ImageProviderOption } from '../image-provider-field'
import { styleRefCopy } from './copy'

type Range = { min: number; max: number }

const range = z.object({ min: z.int().nonnegative(), max: z.int().nonnegative() }).refine(r => r.min <= r.max)

export function referenceBudget(providers: readonly ImageProviderOption[], providerId: string | null, fieldsJson: string, refs: number) {
  const model = modelRange(providers, providerId)
  const users = userRange(fieldsJson)
  const total = users && { min: users.min + refs, max: users.max + refs }
  return { users, refs, total, model, problem: rangeProblem(total, model, refs) }
}

function rangeProblem(total: Range | null, model: Range | null, refs: number) {
  if (!model) return refs > 0 ? styleRefCopy.missingCap : null
  if (!total) return null
  if (total.min < model.min) return styleRefCopy.under
  if (total.max > model.max) return styleRefCopy.over
  return null
}

function modelRange(providers: readonly ImageProviderOption[], providerId: string | null): Range | null {
  const provider = providers.find(p => providerId ? p.id === providerId : p.isActive)
  if (provider?.capabilities) return { min: provider.capabilities.minReferences, max: provider.capabilities.maxReferences }
  return provider?.openAI ? { min: 0, max: OPENAI_MAX_REFERENCES } : null
}

function userRange(json: string): Range | null {
  try {
    const parsed = range.safeParse(JSON.parse(json)?.images)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// A template may need a style reference to meet its model's minimum on the very first save.
export function refUploadId(id: string): string | null {
  const parsed = templateInputSchema.shape.id.safeParse(id.trim())
  return parsed.success ? parsed.data : null
}
