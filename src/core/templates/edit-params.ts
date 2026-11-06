import { z } from 'zod'

// Photo editing (ARCHITECTURE §5.2, T30). Editing runs as the built-in template `edit`: it is in
// no catalogue (visible_in is empty) and its texts are core prompts, so the repository only holds
// their shape; the Owner writes them in /admin/templates/edit (template_prompts.model_params).

export const EDIT_TEMPLATE_ID = 'edit'

// The five ranges the decision step asks about, one predicate question each, in asking order.
export const DECIDED_SCOPES = ['object', 'background', 'style', 'subject', 'overall'] as const
// Plus the paragraph used when no question reaches 0.5, or the call fails or runs out of time.
export const EDIT_SCOPES = [...DECIDED_SCOPES, 'fallback'] as const

export type DecidedScope = (typeof DECIDED_SCOPES)[number]
export type EditScope = (typeof EDIT_SCOPES)[number]

// "What would you like to change?" (DESIGN §1): required, any language, kept as typed.
export const INSTRUCTION_MAX_LENGTH = 500

export const instructionSchema = z.string().trim().min(1).max(INSTRUCTION_MAX_LENGTH)

const question = z.string().trim().min(1).max(4000)
// A paragraph may be left empty; it is then simply not added.
const paragraph = z.string().trim().max(8000)

export const editParamsSchema = z.object({
  // Sent to /v1/images/edits when set and the model supports it.
  input_fidelity: z.enum(['high', 'low']).optional(),
  questions: z.object(Object.fromEntries(DECIDED_SCOPES.map((scope) => [scope, question])) as Record<DecidedScope, typeof question>),
  constraints: z.object(Object.fromEntries(EDIT_SCOPES.map((scope) => [scope, paragraph])) as Record<EditScope, typeof paragraph>),
})

export type EditParams = z.infer<typeof editParamsSchema>
