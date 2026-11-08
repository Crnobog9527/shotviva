import { z } from 'zod'

// Photo editing (ARCHITECTURE §5.2, T30). Editing runs as the built-in template `edit`: it is in
// no catalogue (visible_in is empty) and its texts are core prompts, so the repository only holds
// their shape; the Owner writes them in /admin/templates/edit (template_prompts.model_params).

export const EDIT_TEMPLATE_ID = 'edit'

// The five ranges the classifier picks from.
export const DECIDED_SCOPES = ['object', 'background', 'style', 'subject', 'global'] as const
// Plus the paragraph used when confidence is under 0.5, or the call fails or runs out of time.
export const EDIT_SCOPES = [...DECIDED_SCOPES, 'fallback'] as const
// Ranges whose paragraph also lists the elements the classifier said must stay (§5.2).
export const KEEP_LIST_SCOPES: readonly EditScope[] = ['object', 'background']

export type DecidedScope = (typeof DECIDED_SCOPES)[number]
export type EditScope = (typeof EDIT_SCOPES)[number]

// "What would you like to change?" (DESIGN §1): required, any language, kept as typed.
export const INSTRUCTION_MAX_LENGTH = 500

export const instructionSchema = z.string().trim().min(1).max(INSTRUCTION_MAX_LENGTH)

// A paragraph may be left empty; it is then simply not added.
const paragraph = z.string().trim().max(8000)

export const editParamsSchema = z.object({
  // Sent to /v1/images/edits when set and the model supports it.
  input_fidelity: z.enum(['high', 'low']).optional(),
  // The classifier's own instructions (system text), sent with the photo and the user's words.
  classifier: z.string().trim().min(1).max(20000),
  constraints: z.object(Object.fromEntries(EDIT_SCOPES.map((scope) => [scope, paragraph])) as Record<EditScope, typeof paragraph>),
  // Added at the end when the edit asks for another size than the work's (T47, §5.2): extend
  // the picture to the new frame, the subject where it is. Optional, so older rows still parse.
  reframe: paragraph.optional(),
  // 「生成其他语言版本」 of a template cover (ARCHITECTURE §8.3, T87): translate only the words in
  // the picture, keep everything else. `{{language}}` becomes the target language's English name.
  // Optional: until the Owner writes it, cover translation says it is not set up.
  cover_translate: paragraph.optional(),
})

export type EditParams = z.infer<typeof editParamsSchema>
