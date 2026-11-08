import { z } from 'zod'

// The shape of examples.recorded.json, which the admin dry run and the eval script print, so a
// real run can be pasted in as it is.
export const recordedAnswerSchema = z.object({
  identitySwap: z.boolean(),
  ms: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
})

export const recordingSchema = z.object({
  note: z.string().optional(),
  model: z.string().nullable(),
  recordedAt: z.string().nullable(),
  // Which judge prompt the answers came from (IDENTITY_PROMPT_VERSION at the time).
  promptVersion: z.string().nullable().optional(),
  // Sentences whose answer must be recorded again (added since the run, or the prompt changed
  // for them). Each one has no answer; the next full run empties this list.
  pending: z.array(z.string()).default([]),
  answers: z.record(z.string(), recordedAnswerSchema),
})

export type Recording = z.infer<typeof recordingSchema>
