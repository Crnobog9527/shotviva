import { OPENAI_MAX_REFERENCES } from '@/core/templates/image-capabilities'
import type { ImageProviderOption } from '../image-provider-field'
import { styleRefCopy } from './copy'

export function referenceBudget(providers: readonly ImageProviderOption[], providerId: string | null, fieldsJson: string, refs: number) {
  const max = modelLimit(providers, providerId)
  const users = userImageLimit(fieldsJson)
  let problem = null
  if (refs > 0 && max === null) problem = styleRefCopy.missingCap
  if (users !== null && max !== null && users + refs > max) problem = styleRefCopy.over
  return { users, refs, max, problem }
}

function modelLimit(providers: readonly ImageProviderOption[], providerId: string | null) {
  const model = providers.find(p => providerId ? p.id === providerId : p.isActive)
  return model?.capabilities?.maxReferences ?? (model?.openAI ? OPENAI_MAX_REFERENCES : null)
}

function userImageLimit(json: string): number | null {
  try {
    const max: unknown = JSON.parse(json)?.images?.max
    return typeof max === 'number' && Number.isInteger(max) ? max : null
  } catch {
    return null
  }
}
