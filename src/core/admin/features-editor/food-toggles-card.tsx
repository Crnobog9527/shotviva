'use client'

import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { SettingSwitchCard } from './setting-switch-card'
import type { SwitchCopy } from './switch-copy'

// 1848: the food templates' 优化摆盘 / 优化器皿 (system_settings food_toggles_enabled). Chinese only (DESIGN §7).
export const FOOD_TOGGLES_SWITCH_COPY: SwitchCopy = {
  title: '餐饮模板「优化摆盘」「优化器皿」',
  key: 'food_toggles_enabled',
  body: '关着时，所有页面都不显示这两个选项，服务器也一律按「关」出图（不读菜、不用器皿库，价格不变）。模板里的开关设置和餐饮流程都保留，开启后原样恢复。保存后马上生效，不用重新部署。',
  state: { on: '已开启', off: '已关闭' },
  stateLabel: '当前状态',
  lastChanged: (who: string, at: string) => `最后修改：${who} · ${at}（北京时间）`,
  someone: '未知账号',
  neverChanged: '还没改过，默认关闭',
  turnOn: '开启这两个选项',
  turnOff: '关闭这两个选项',
  saving: '保存中…',
  saved: { on: '两个选项已开启', off: '两个选项已关闭' },
  dialog: {
    on: {
      title: '开启「优化摆盘」「优化器皿」？',
      body: '开启后，带这两个开关的餐饮模板会重新显示它们；用户打开后会先读菜，「优化器皿」还会从器皿库选器皿。',
      confirm: '确认开启',
    },
    off: {
      title: '关闭「优化摆盘」「优化器皿」？',
      body: '关闭后，创作页、批量创作和所有接口都不再提供这两个选项，已打开的页面发来「开」也按「关」出图。模板数据不变。',
      confirm: '确认关闭',
    },
    cancel: '取消',
  },
}

export function FoodTogglesCard({ value, save }: { value: WishlistSwitch; save: (input: WishlistSwitchInput) => Promise<ActionResult> }) {
  return <SettingSwitchCard copy={FOOD_TOGGLES_SWITCH_COPY} value={value} save={save} />
}
