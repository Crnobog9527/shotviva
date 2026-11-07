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
  answers: z.record(z.string(), recordedAnswerSchema),
})

export type Recording = z.infer<typeof recordingSchema>
