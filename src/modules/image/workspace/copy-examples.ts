import type { CatalogueCopyField } from '../catalogue/catalogue-template'

// A template's text fields start from the text on its own cover (fields.copy[].example, Owner
// 2026-11-14: 「表单分组 + 案例预填」), so a user types over only what changes. A draft that
// already holds text (Make again, T40) keeps it; the example is only where a form starts.

type Field = Pick<CatalogueCopyField, 'key' | 'example'>

// The values a fresh form starts with: each field's example, where it has one.
export const copyExamples = (fields: readonly Field[]): Record<string, string> =>
  Object.fromEntries(fields.flatMap((field) => (field.example ? [[field.key, field.example]] : [])))

// Still the example, word for word: drawn greyer until edited.
export const isExample = (field: Field, value: string | undefined): boolean => Boolean(field.example) && value === field.example

// Text the user typed themselves (not blank, not the example): 全部清空 and 恢复示例 ask first.
export const typedCopy = (fields: readonly Field[], copy: Record<string, string>): boolean =>
  fields.some((field) => Boolean(copy[field.key]?.trim()) && copy[field.key] !== field.example)

// The fields that say whose poster it is: the shop or venue (and its English name), the phone or
// WeChat, the address. Still the cover's text, they get one line above Generate, never a block.
// An English name counts on its own (总控 2026-11-14): a changed shop name with the cover's
// English one under it is still someone else's poster.
const OWNER_KEYS = ['venue', 'shop', 'brand', 'store', 'contact', 'phone', 'wechat', 'address']
const isOwnerKey = (key: string) => OWNER_KEYS.some((owner) => key === owner || key === `${owner}_en`)

export function examplesLeft(fields: readonly CatalogueCopyField[], copy: Record<string, string>): string[] {
  return fields.filter((field) => isOwnerKey(field.key) && isExample(field, copy[field.key])).map((field) => field.label)
}

// 清空: these fields blank, the rest as they are.
export const clearCopy = (copy: Record<string, string>, keys: readonly string[]): Record<string, string> =>
  ({ ...copy, ...Object.fromEntries(keys.map((key) => [key, ''])) })
