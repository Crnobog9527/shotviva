import type { EditParams, EditScope } from '@/core/templates'

// What the image model receives for an edit (ARCHITECTURE §5.2): the `edit` template's wrapper,
// the paragraph for the judged range, then the user's words as typed. Empty parts are skipped.
export function composeEditPrompt(wrapper: string, params: EditParams, scope: EditScope, instruction: string): string {
  return [wrapper, params.constraints[scope], instruction]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n\n')
}
