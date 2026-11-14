import { z } from 'zod'

// Field groups (Owner 2026-11-14): a template with many text fields and image slots shows them in
// titled groups that fold, e.g. 店铺基础信息 / 奖品设置 / 地址信息, instead of one long list where
// the most important lines end up at the bottom. Stored in templates.fields.groups (jsonb, no
// migration), so the admin editor's 字段定义 JSON edits it and template-sync carries it. A group
// lists text-field keys and image-slot keys in the order they are shown; a block inside a group
// keeps the parts of one thing together (a prize: its name, its note, its photo). Display only:
// what reaches the model is unchanged. A template without groups keeps the plain layout. No
// `server-only`: the editor, the workspace and the scripts share these shapes.

export const FIELD_GROUPS_MAX = 6

const KEY = /^[a-z][a-z0-9_]*$/
const memberKey = z.string().regex(KEY)
const label = z.string().trim().min(1).max(60)

// English label; labelZh is its Chinese, kept beside it (not in translations) so the one JSON box
// in the admin editor holds the whole group.
export const fieldBlockSchema = z.strictObject({
  key: z.string().regex(KEY),
  label,
  labelZh: label.optional(),
  items: z.array(memberKey).min(1).max(8),
})

export const fieldGroupSchema = z.strictObject({
  key: z.string().regex(KEY),
  label,
  labelZh: label.optional(),
  // Unfolded when the form opens; the rest start folded.
  open: z.boolean().default(false),
  items: z.array(z.union([memberKey, fieldBlockSchema])).min(1).max(16),
})

export const fieldGroupsSchema = z.array(fieldGroupSchema).min(1).max(FIELD_GROUPS_MAX)

export type FieldBlock = z.infer<typeof fieldBlockSchema>
export type FieldGroup = z.infer<typeof fieldGroupSchema>
export type FieldGroupItem = FieldGroup['items'][number]

type GroupedFields = { groups?: readonly FieldGroup[]; copy: readonly { key: string }[]; images: { slots?: readonly { key: string }[] } }

// Every text field and image slot a group lists, in order (blocks flattened).
export const groupMembers = (group: Pick<FieldGroup, 'items'>): string[] =>
  group.items.flatMap((item) => (typeof item === 'string' ? [item] : item.items))

// The schema's refusals (English: the import scripts print them too). With groups, every text
// field and image slot sits in exactly one place, so nothing the template asks for is hidden.
export function groupShapeProblems(fields: GroupedFields): string[] {
  const groups = fields.groups ?? []
  if (groups.length === 0) return []
  const problems: string[] = []
  const ownKeys = groups.flatMap((group) => [group.key, ...group.items.flatMap((item) => (typeof item === 'string' ? [] : [item.key]))])
  if (new Set(ownKeys).size !== ownKeys.length) problems.push('group and block keys must be unique')
  const known = [...fields.copy.map((field) => field.key), ...(fields.images.slots ?? []).map((slot) => slot.key)]
  const listed = groups.flatMap(groupMembers)
  if (listed.some((key) => !known.includes(key))) problems.push('a group can only list text fields and image slots the template defines')
  if (new Set(listed).size !== listed.length) problems.push('a text field or image slot can sit in one group only')
  if (known.some((key) => !listed.includes(key))) problems.push('with groups, every text field and image slot must sit in a group')
  return problems
}

// The page's language: Chinese takes labelZh when there is one.
export function localizeGroups(groups: readonly FieldGroup[] | undefined, locale: string): FieldGroup[] | undefined {
  if (!groups || locale !== 'zh') return groups ? [...groups] : undefined
  const pick = <T extends { label: string; labelZh?: string }>(item: T): T => ({ ...item, label: item.labelZh || item.label })
  return groups.map((group) => ({ ...pick(group), items: group.items.map((item) => (typeof item === 'string' ? item : pick(item))) }))
}
