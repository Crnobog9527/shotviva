import { ProviderError } from '@/core/jobs'

type OpenAIErrorBody = { error?: { code?: string | null; type?: string | null } }

// OpenAI's own safety refusal; the job is refunded and the user told it was declined.
const REJECTION_CODES = new Set(['moderation_blocked', 'content_policy_violation', 'image_generation_user_error'])

// Only status, code and type are kept: OpenAI messages can quote the request, and prompt
// bodies must never reach logs.
export async function toProviderError(response: Response): Promise<ProviderError> {
  const body = (await response.json().catch(() => ({}))) as OpenAIErrorBody
  const code = body.error?.code ?? null
  const type = body.error?.type ?? null
  const detail = `openai ${response.status} code=${code ?? '-'} type=${type ?? '-'}`
  if (response.status === 400 && code !== null && REJECTION_CODES.has(code)) {
    return new ProviderError('content_rejected', detail)
  }
  return new ProviderError('failed', detail)
}
