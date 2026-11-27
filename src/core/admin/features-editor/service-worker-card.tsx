'use client'

import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { SettingSwitchCard } from './setting-switch-card'
import type { SwitchCopy } from './switch-copy'

// 1999: the home-screen app's service worker (system_settings service_worker_enabled, core/offline).
// Chinese only (DESIGN §7). Turning it off is also the kill switch.
export const SERVICE_WORKER_SWITCH_COPY: SwitchCopy = {
  title: '手机离线缓存（Service Worker）',
  key: 'service_worker_enabled',
  summary: {
    purpose: '手机把公开文件存在本机，重新打开更快。',
    whenOn: '脚本、样式、字体和公开模板目录存在手机上；不存页面和账号数据',
    whenOff: '用户下次打开时手机上的缓存被清空，Service Worker 自动卸载',
    emergency: true,
  },
  body: '开启后，手机（尤其是添加到主屏幕的 App）会把脚本、样式、字体和公开模板目录存在本机，重新打开时不用再跨境下载。只存公开文件，不存页面、余额或任何账号数据。关闭后，用户下次打开网站时，手机上的缓存会被清空并自动卸载。保存后马上生效，不用重新部署。',
  state: { on: '已开启', off: '已关闭' },
  stateLabel: '当前状态',
  lastChanged: (who: string, at: string) => `最后修改：${who} · ${at}（北京时间）`,
  someone: '未知账号',
  neverChanged: '还没改过，默认关闭',
  turnOn: '开启离线缓存',
  turnOff: '关闭离线缓存',
  saving: '保存中…',
  saved: { on: '离线缓存已开启', off: '离线缓存已关闭，手机上的缓存会在下次打开时清除' },
  dialog: {
    on: {
      title: '开启手机离线缓存？',
      body: '用户下次打开网站时开始生效：脚本、样式、字体和公开模板目录会存在手机上。页面和账号数据仍然每次从服务器取。',
      confirm: '确认开启',
    },
    off: {
      title: '关闭手机离线缓存？',
      body: '这也是出问题时的紧急开关：用户下次打开网站时，手机上的离线缓存会被清空，Service Worker 自动卸载，网站照常从服务器加载。',
      confirm: '确认关闭',
    },
    cancel: '取消',
  },
}

// 2001: Create's app shell (system_settings service_worker_shell_enabled, ARCHITECTURE §18.3), apart
// from the switch above so it can be turned off alone. Works only while that one is on.
export const APP_SHELL_SWITCH_COPY: SwitchCopy = {
  title: '创作页秒开（App 外壳）',
  key: 'service_worker_shell_enabled',
  summary: {
    purpose: '手机打开创作页时先画出页面框架，不用干等。',
    whenOn: '创作页先显示手机上存的框架（不含任何账号数据），真实页面到了就换上',
    whenOff: '创作页照常从服务器加载；离线缓存的其他部分不受影响',
    emergency: true,
  },
  body: '开启后，从手机打开创作页时，先用手机上存的页面框架（不含余额、头像、作品等任何账号数据）马上画出来，同时向服务器取真实页面，到了就换上。需要上面的「手机离线缓存」也开着才生效。只在测试站验收通过后再在正式站开启。保存后马上生效，不用重新部署。',
  state: { on: '已开启', off: '已关闭' },
  stateLabel: '当前状态',
  lastChanged: (who: string, at: string) => `最后修改：${who} · ${at}（北京时间）`,
  someone: '未知账号',
  neverChanged: '还没改过，默认关闭',
  turnOn: '开启创作页秒开',
  turnOff: '关闭创作页秒开',
  saving: '保存中…',
  saved: { on: '创作页秒开已开启', off: '创作页秒开已关闭，手机上存的页面框架会在下次打开时清除' },
  dialog: {
    on: {
      title: '开启创作页秒开？',
      body: '用户下次打开网站时开始生效：创作页先显示手机上存的页面框架，再换成服务器的真实页面。账号数据仍然每次从服务器取。',
      confirm: '确认开启',
    },
    off: {
      title: '关闭创作页秒开？',
      body: '出问题时用这个开关：用户下次打开网站时，手机上存的创作页框架会被清除，创作页照常从服务器加载。静态文件和封面的离线缓存不受影响。',
      confirm: '确认关闭',
    },
    cancel: '取消',
  },
}

export function AppShellCard({ value, save }: { value: WishlistSwitch; save: (input: WishlistSwitchInput) => Promise<ActionResult> }) {
  return <SettingSwitchCard copy={APP_SHELL_SWITCH_COPY} value={value} save={save} />
}

export function ServiceWorkerCard({ value, save }: { value: WishlistSwitch; save: (input: WishlistSwitchInput) => Promise<ActionResult> }) {
  return <SettingSwitchCard copy={SERVICE_WORKER_SWITCH_COPY} value={value} save={save} />
}
