import { ProviderError } from '@/core/jobs'

type OpenAIErrorBody = { error?: { code?: string | null; type?: string | null } }

// Status, code and type of a failed response. Only these are kept: OpenAI messages can quote the
// request, and prompt bodies must never reach logs.
export type OpenAIFailure = { status: number; code: string | null; type: string | null }

// OpenAI's own safety refusal; the job is refunded and the user told it was declined.
const REJECTION_CODES = new Set(['moderation_blocked', 'content_policy_violation', 'image_generation_user_error'])

export async function readOpenAIFailure(response: Response): Promise<OpenAIFailure> {
  const body = (await response.json().catch(() => ({}))) as OpenAIErrorBody
  return { status: response.status, code: body.error?.code ?? null, type: body.error?.type ?? null }
}

export function failureToProviderError({ status, code, type }: OpenAIFailure): ProviderError {
  const detail = `openai ${status} code=${code ?? '-'} type=${type ?? '-'}`
  if (status === 400 && code !== null && REJECTION_CODES.has(code)) {
    return new ProviderError('content_rejected', detail)
  }
  return new ProviderError('failed', detail)
}
