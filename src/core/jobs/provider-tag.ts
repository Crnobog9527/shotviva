// generation_jobs.provider (ARCHITECTURE §3.3, §4): `<ai_providers.id | env>/<model>`, kept for
// per-model cost accounting. Ids are uuids, so the first slash always ends the source and a
// model name may itself contain slashes.

export const ENV_PROVIDER_SOURCE = 'env'

export function providerTag(source: string, model: string): string {
  return `${source}/${model}`
}

// The model half, or null for jobs written before T17 (e.g. 'openai-image').
export function modelFromTag(tag: string | null): string | null {
  const slash = tag?.indexOf('/') ?? -1
  return tag && slash > 0 && slash < tag.length - 1 ? tag.slice(slash + 1) : null
}
