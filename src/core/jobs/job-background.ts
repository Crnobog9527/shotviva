import { z } from 'zod'

import type { GenerationProvider } from './provider'

// Whether a result is a cut-out (transparent background) comes from what its template asked the
// model for, template_prompts.model_params.background, recorded on the job at reserve time as
// inputs.background, and only when the provider that will run it sends that to the model
// (honoursBackground): an OpenRouter route passes it only to models that list the value, so its
// result is left unknown rather than labelled a cut-out it is not. No pixels are read per request, and the private params
// never leave the server: only the one word is kept.
const backgroundSchema = z.enum(['transparent', 'opaque', 'auto'])

export function backgroundInput(
  params: Record<string, unknown>,
  provider: Pick<GenerationProvider, 'honoursBackground'>,
): { background?: z.infer<typeof backgroundSchema> } {
  if (!provider.honoursBackground) return {}
  const parsed = backgroundSchema.safeParse(params.background)
  return parsed.success ? { background: parsed.data } : {}
}

// Whether a result may keep its alpha channel: only when the template asked for a cut-out. Every
// other result (posters, edits, auto) is flattened before it is stored, whatever the model returned.
export const keepsAlpha = (params: Record<string, unknown>): boolean => params.background === 'transparent'
