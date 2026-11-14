import 'server-only'

import type { OpenAIResponsesConfig } from '../edit/openai-responses'
import { readPieces } from './read-pieces'

// OpenAI's Responses API with stream: true (server-sent events): each piece of the answer's text
// goes to onDelta as it is written, then the whole text is parsed as JSON. Only the HTTP status
// or the event type leaves on failure: a body can echo the request.

export type StreamUsage = { inputTokens: number; outputTokens: number } | null
export type StreamedAnswer = { json: unknown; usage: StreamUsage; firstTokenMs: number | null }

type StreamEvent = {
  type?: string
  delta?: string
  response?: { usage?: { input_tokens?: number; output_tokens?: number } | null }
}

type StreamState = { text: string; usage: StreamUsage; completed: boolean; firstTokenMs: number | null }
type Handler = (event: StreamEvent, state: StreamState) => void

const fail: Handler = (event) => {
  throw new Error(`openai responses ${event.type}`)
}
const HANDLERS: Record<string, Handler> = {
  'response.completed': (event, state) => {
    const used = event.response?.usage
    state.completed = true
    state.usage = used ? { inputTokens: used.input_tokens ?? 0, outputTokens: used.output_tokens ?? 0 } : null
  },
  'response.failed': fail,
  'response.incomplete': fail,
  error: fail,
}

// One server-sent event block ("event: …\ndata: {…}").
function readEvent(block: string, state: StreamState, onText: (delta: string) => void) {
  const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
  if (!data || data === '[DONE]') return
  const event = JSON.parse(data) as StreamEvent
  if (event.type === 'response.output_text.delta') onText(event.delta ?? '')
  else HANDLERS[event.type ?? '']?.(event, state)
}

export async function streamResponses(config: OpenAIResponsesConfig, body: unknown, signal: AbortSignal, onDelta: (delta: string) => void): Promise<StreamedAnswer> {
  const started = performance.now()
  const response = await (config.fetch ?? fetch)(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`openai responses ${response.status}`)
  }
  const state: StreamState = { text: '', usage: null, completed: false, firstTokenMs: null }
  const onText = (delta: string) => {
    state.firstTokenMs ??= Math.round(performance.now() - started)
    state.text += delta
    onDelta(delta)
  }
  await readPieces(response.body, '\n\n', (block) => readEvent(block, state, onText))
  // A refusal has no output text; it is a failure like any other.
  if (!state.completed || !state.text) throw new Error('openai responses ended without an answer')
  return { json: JSON.parse(state.text), usage: state.usage, firstTokenMs: state.firstTokenMs }
}
