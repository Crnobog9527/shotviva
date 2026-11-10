import { toggleFragments } from '@/core/templates/toggles'
import type { PromptSnapshot } from '../templates/types'
import type { TemplateFormValues } from './form-state'

export function versionPatch(values: TemplateFormValues, version: PromptSnapshot, historicalRouteAvailable: boolean): Partial<TemplateFormValues> {
  const fragments = toggleFragments(version.modelParams)
  return {
    restoredParams: version.modelParams, selectedVersion: version.version, forkVersion: !historicalRouteAvailable,
    promptBody: version.body,
    styleRefs: version.styleRefs, styleRefsEdited: true,
    toggles: values.toggles.map(t => ({ ...t, on: fragments[t.key]?.on ?? '', off: fragments[t.key]?.off ?? '' })),
  }
}
