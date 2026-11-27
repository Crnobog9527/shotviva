'use client'

import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { SettingSwitchCard } from './setting-switch-card'
import type { SwitchCopy } from './switch-copy'

// 2009: the food templates' 优化摆盘 and 优化器皿, one card each (system_settings
// food_plating_enabled, food_tableware_enabled). Chinese only (DESIGN §7).
const common = {
  stateLabel: '当前状态',
  lastChanged: (who: string, at: string) => `最后修改：${who} · ${at}（北京时间）`,
  someone: '未知账号',
  neverChanged: '还没改过，默认关闭',
  saving: '保存中…',
  state: { on: '已开启', off: '已关闭' },
}

// The dish name is read by both flows, so either card turned on shows it.
const DISH_NAME = '「菜名（选填）」在两个选项任一开启时显示，都关闭时隐藏。'

export const FOOD_PLATING_SWITCH_COPY: SwitchCopy = {
  ...common,
  title: '餐饮模板「优化摆盘」',
  key: 'food_plating_enabled',
  summary: {
    purpose: '餐饮模板的「优化摆盘」选项：先读菜，再按菜重新摆盘。',
    whenOn: '带这个开关的餐饮模板显示「优化摆盘」，用户打开后按新摆盘出图',
    whenOff: '所有页面都不显示，服务器一律按「关」出图；「优化器皿」不受影响',
  },
  body: `关着时，所有页面都不显示「优化摆盘」，服务器也一律按「关」出图，价格不变。和「优化器皿」互不影响。${DISH_NAME}模板里的开关设置都保留，开启后原样恢复。保存后马上生效，不用重新部署。`,
  turnOn: '开启优化摆盘',
  turnOff: '关闭优化摆盘',
  saved: { on: '「优化摆盘」已开启', off: '「优化摆盘」已关闭' },
  dialog: {
    on: {
      title: '开启「优化摆盘」？',
      body: '开启后，带这个开关的餐饮模板会重新显示它；用户打开后会先读菜，再按菜重新摆盘。',
      confirm: '确认开启',
    },
    off: {
      title: '关闭「优化摆盘」？',
      body: '关闭后，创作页、批量创作和所有接口都不再提供这个选项，已打开的页面发来「开」也按「关」出图。「优化器皿」不受影响。',
      confirm: '确认关闭',
    },
    cancel: '取消',
  },
}

export const FOOD_TABLEWARE_SWITCH_COPY: SwitchCopy = {
  ...common,
  title: '餐饮模板「优化器皿」',
  key: 'food_tableware_enabled',
  summary: {
    purpose: '餐饮模板的「优化器皿」选项：先读菜，再从器皿库换上配套器皿。',
    whenOn: '带这个开关的餐饮模板显示「优化器皿」，用户打开后从器皿库选器皿；价格不变',
    whenOff: '所有页面都不显示，服务器一律按「关」出图；「优化摆盘」不受影响',
  },
  body: `关着时，所有页面都不显示「优化器皿」，服务器也一律按「关」出图（不用器皿库），价格不变。和「优化摆盘」互不影响。${DISH_NAME}模板里的开关设置都保留，开启后原样恢复。保存后马上生效，不用重新部署。`,
  turnOn: '开启优化器皿',
  turnOff: '关闭优化器皿',
  saved: { on: '「优化器皿」已开启', off: '「优化器皿」已关闭' },
  dialog: {
    on: {
      title: '开启「优化器皿」？',
      body: '开启后，带这个开关的餐饮模板会重新显示它；用户打开后会先读菜，再从器皿库选一只配套的器皿换上。器皿库里没有这类菜的器皿时，保留用户自己的器皿。',
      confirm: '确认开启',
    },
    off: {
      title: '关闭「优化器皿」？',
      body: '关闭后，创作页、批量创作和所有接口都不再提供这个选项，已打开的页面发来「开」也按「关」出图。「优化摆盘」不受影响。',
      confirm: '确认关闭',
    },
    cancel: '取消',
  },
}

type CardProps = { value: WishlistSwitch; save: (input: WishlistSwitchInput) => Promise<ActionResult> }

export function FoodPlatingCard({ value, save }: CardProps) {
  return <SettingSwitchCard copy={FOOD_PLATING_SWITCH_COPY} value={value} save={save} />
}

export function FoodTablewareCard({ value, save }: CardProps) {
  return <SettingSwitchCard copy={FOOD_TABLEWARE_SWITCH_COPY} value={value} save={save} />
}
