import { ProviderError, type GenerationProvider, type TemplateProvider } from '../../src/core/jobs'
import { resolveTemplateProvider } from '../../src/core/jobs/provider'

// Why a provider call failed, as far as a retry is concerned. admin_test_runs only keeps
// PROVIDER_FAILED / PROVIDER_TIMEOUT; the adapters' error text keeps the HTTP status and OpenAI's
// error code (never the vendor message, which may quote the prompt), and this reads them there:
// openai "openai 402 code=insufficient_quota …", OpenRouter "… (HTTP 400)",
// Ark "… (HTTP 429 code=AccountQuotaExceeded)".

export type Failure = { kind: 'timeout' | 'failed' | 'content_rejected'; status: number | null; code: string | null }

export function readFailure(error: unknown): Failure | null {
  if (!(error instanceof ProviderError)) return null
  const openai = /openai (\d{3}) code=(\S+)/.exec(error.message)
  const http = /HTTP (\d{3})/.exec(error.message)
  const ark = /HTTP \d{3} code=([A-Za-z0-9_.]+)\)/.exec(error.message)
  const status = openai ? Number(openai[1]) : http ? Number(http[1]) : null
  const code = openai && openai[2] !== '-' ? openai[2] : ark ? ark[1] : null
  return { kind: error.kind, status, code }
}

// A failure that the same request will meet again: a refusal, a bad request, missing auth, no
// credit or quota. Rate limits (429 without a quota code), 5xx, timeouts and network errors pass.
export function isDeterministic(failure: Failure | null): boolean {
  if (!failure) return false
  if (failure.kind === 'content_rejected') return true
  if (failure.code && /quota|billing|credit/i.test(failure.code)) return true
  return failure.status !== null && failure.status >= 400 && failure.status < 500 && failure.status !== 408 && failure.status !== 429
}

// The same provider, noting the last failure of this one call (a trial run makes one image call).
export function watchedProvider(provider: TemplateProvider, slot: { failure?: Failure | null }): TemplateProvider {
  return async (id, request) => {
    const resolved: GenerationProvider = await resolveTemplateProvider(provider, id, request)
    return {
      ...resolved,
      generate: async input => {
        try {
          return await resolved.generate(input)
        } catch (error) {
          slot.failure = readFailure(error)
          throw error
        }
      },
    }
  }
}
