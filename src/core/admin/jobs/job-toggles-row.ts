import { z } from 'zod'

// A job's template toggles (T89) as the admin lists read them: two small jsonb objects of at most
// three keys each, selected by path so the rest of `inputs` is never read. Shared by 出图记录 and
// the user detail dialog. null on jobs of templates without toggles; anything odd reads as none.

export const TOGGLE_COLUMNS = 'toggles:inputs->toggles, toggles_confirmed_at:inputs->toggles_confirmed_at'

export const toggleColumnsSchema = {
  toggles: z.record(z.string(), z.boolean()).nullable().optional().catch(null),
  toggles_confirmed_at: z.record(z.string(), z.string()).nullable().optional().catch(null),
}

// Each toggle with when the user accepted its confirm dialog (null when off or no dialog).
export type JobToggle = { key: string; on: boolean; confirmedAt: string | null }

export function toJobToggles(row: { toggles?: Record<string, boolean> | null; toggles_confirmed_at?: Record<string, string> | null }): JobToggle[] {
  return Object.entries(row.toggles ?? {}).map(([key, on]) => ({ key, on, confirmedAt: row.toggles_confirmed_at?.[key] ?? null }))
}
