import { vi } from 'vitest'

import { parseServerEnv } from '@/core/env'
import type { ProviderAdapters } from '@/core/providers'
import { createOpenAIImageProvider } from '@/modules/image'

import { png } from '../fakes/images'

// T17 fixtures: a resolver that never touches DNS, and the real openai_images adapter wired to
// a fake fetch that records what it was asked to send. Keys go into the local stack's Vault.

export const providerEnv = (extra: Record<string, string> = {}) => parseServerEnv(extra)
export const publicHost = async () => ['93.184.216.34']

export type RecordedCall = { url: string; authorization: string | undefined; model: string | null }

export async function recordingAdapters() {
  const calls: RecordedCall[] = []
  const b64 = Buffer.from(await png(64, 64)).toString('base64')
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body
    const model = body instanceof FormData ? String(body.get('model')) : (JSON.parse(String(body)) as { model: string }).model
    calls.push({ url: String(url), authorization: (init?.headers as Record<string, string>).Authorization, model })
    return new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200 })
  })
  const adapters: ProviderAdapters = {
    openai_images: (config) => createOpenAIImageProvider({ ...config, fetch: fetchImpl as typeof fetch }),
  }
  return { adapters, calls }
}
