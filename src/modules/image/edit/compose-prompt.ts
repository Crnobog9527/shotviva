import { KEEP_LIST_SCOPES, type EditParams, type EditScope } from '@/core/templates'

// What the image model receives for an edit (ARCHITECTURE §5.2): the `edit` template's wrapper,
// the paragraph for the judged range (with the classifier's keep list for object and background
// edits), then the user's words as typed, and when the edit changes the size, the reframe
// paragraph last (T47). Empty parts are skipped.
export function composeEditPrompt(
  wrapper: string,
  params: EditParams,
  scope: EditScope,
  instruction: string,
  keep: string[] = [],
  reframed = false,
): string {
  const keepLine = KEEP_LIST_SCOPES.includes(scope) && keep.length > 0 ? `Keep unchanged: ${keep.join('; ')}.` : ''
  const paragraph = [params.constraints[scope].trim(), keepLine].filter(Boolean).join(' ')
  return [wrapper, paragraph, instruction, reframed ? (params.reframe ?? '') : '']
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n\n')
}
