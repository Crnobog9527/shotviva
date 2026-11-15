import { z } from 'zod'

// What `pnpm templates:judge` checks a trial result against (templates:apply and templates:trial
// ignore it). The checklist lives in the local batch file, never in the repo: one yes/no item per
// line, written so that "yes" means the result is good ("The dish matches the photo, including
// ingredient colours"). The family's list is the batch file's top-level `judge.bar`; a template
// adds its own; an input set adds the items only it needs (a toggle's promise).

export const JUDGE_ITEM_MAX = 300
export const JUDGE_ITEMS_MAX = 20

export const judgeItemSchema = z.string().trim().min(3).max(JUDGE_ITEM_MAX)
const items = z.array(judgeItemSchema).max(JUDGE_ITEMS_MAX)

// Checks run on the pixels, without a model.
const deterministic = {
  // 'opaque': the result must have no see-through pixel; 'transparent': it must have some (a
  // cut-out). Omitted: follows the template (model_params.background 'transparent' → transparent,
  // else opaque). 'any': not checked.
  alpha: z.enum(['opaque', 'transparent', 'any']).optional(),
  // A QR code the result must carry and read back: the text it must say, or the input slot whose
  // uploaded code it must match.
  qr: z.union([z.strictObject({ text: z.string().min(1).max(2000) }), z.strictObject({ slot: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64) })]).optional(),
  // Ask the model whether each non-empty copy field of the input set appears in the image exactly
  // as typed (there is no OCR here).
  expectText: z.boolean().optional(),
}

export const familyJudgeSchema = z.strictObject({ bar: items.min(1), ...deterministic })
export const templateJudgeSchema = z.strictObject({ bar: items.optional(), ...deterministic })
// Extra items for one input set.
export const inputJudgeSchema = items.min(1)

export type FamilyJudge = z.infer<typeof familyJudgeSchema>
export type TemplateJudge = z.infer<typeof templateJudgeSchema>
