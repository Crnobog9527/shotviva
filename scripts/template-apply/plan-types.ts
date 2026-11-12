// One row of the result table: what the item will do (ops, sent to admin_apply_template_batch in
// order) or why it cannot (problems, found before anything is sent). Notes never block.
export type PlanItem = {
  ref: string
  kind: 'category' | 'reference' | 'series' | 'template'
  label: string
  actions: string[]
  ops: Record<string, unknown>[]
  problems: string[]
  notes: string[]
}
