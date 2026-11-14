import { describe, expect, it } from 'vitest'

import { groupMembers, localizeGroups } from './field-groups'
import { templateFieldsSchema } from './schema'

const base = {
  images: { min: 0, max: 2, slots: [{ key: 'logo', label: 'Venue logo' }, { key: 'prize_1', label: '1st prize photo', note: 'prize_1_note' }] },
  copy: [
    { key: 'venue', label: 'Venue name', required: true },
    { key: 'prize_1_name', label: '1st prize', required: true },
    { key: 'prize_1_note', label: '1st prize details' },
    { key: 'address', label: 'Address' },
  ],
  aspectRatios: ['3:4'],
}
const groups = [
  { key: 'basics', label: 'Venue', labelZh: '店铺基础信息', open: true, items: ['venue', 'logo'] },
  { key: 'prizes', label: 'Prizes', labelZh: '奖品设置', items: [{ key: 'first', label: '1st', labelZh: '第1名', items: ['prize_1_name', 'prize_1_note', 'prize_1'] }] },
  { key: 'where', label: 'Address', items: ['address'] },
]

describe('fields.groups', () => {
  it('accepts groups that list every text field and image slot once, folded unless marked open', () => {
    const fields = templateFieldsSchema.parse({ ...base, groups })
    expect(fields.groups?.map((group) => group.open)).toEqual([true, false, false])
    expect(groupMembers(fields.groups![1]!)).toEqual(['prize_1_name', 'prize_1_note', 'prize_1'])
  })

  it('leaves a template without groups as it was', () => {
    expect(templateFieldsSchema.parse(base).groups).toBeUndefined()
  })

  it.each([
    ['a field left out', groups.slice(0, 2)],
    ['an unknown key', [...groups, { key: 'more', label: 'More', items: ['phone'] }]],
    ['a field listed twice', [...groups.slice(0, 2), { key: 'where', label: 'Address', items: ['address', 'venue'] }]],
    ['a repeated group key', [...groups.slice(0, 2), { key: 'basics', label: 'Address', items: ['address'] }]],
    ['a block key equal to a group key', [groups[0], { ...groups[1], items: [{ key: 'basics', label: '1st', items: ['prize_1_name', 'prize_1_note', 'prize_1'] }] }, groups[2]]],
    ['an unknown property', [{ ...groups[0], hint: 'x' }, ...groups.slice(1)]],
    ['an empty group', [...groups, { key: 'none', label: 'None', items: [] }]],
  ])('refuses %s', (_, value) => {
    expect(templateFieldsSchema.safeParse({ ...base, groups: value }).success).toBe(false)
  })

  it('shows the Chinese labels on Chinese pages and the English ones otherwise', () => {
    const parsed = templateFieldsSchema.parse({ ...base, groups }).groups
    const zh = localizeGroups(parsed, 'zh')!
    expect(zh.map((group) => group.label)).toEqual(['店铺基础信息', '奖品设置', 'Address'])
    expect(zh[1]!.items[0]).toMatchObject({ label: '第1名' })
    expect(localizeGroups(parsed, 'en')!.map((group) => group.label)).toEqual(['Venue', 'Prizes', 'Address'])
    expect(localizeGroups(undefined, 'zh')).toBeUndefined()
  })
})
