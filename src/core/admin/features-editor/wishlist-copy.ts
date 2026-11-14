import type { SwitchCopy } from './switch-copy'

// The 需求墙 switch card on /admin/features (ARCHITECTURE §15.6, T62). Admin copy is Chinese
// only (DESIGN §7, AGENTS §9).
export const WISHLIST_SWITCH_COPY = {
  title: '需求墙',
  key: 'wishlist_enabled',
  body: '用户提交想要的模板、互相投票的页面。开关保存后马上生效，不用重新部署。',
  state: { on: '已开启', off: '已关闭' },
  stateLabel: '当前状态',
  lastChanged: (who: string, at: string) => `最后修改：${who} · ${at}（北京时间）`,
  someone: '未知账号',
  neverChanged: '还没改过，默认关闭',
  previewOverride: '这个预览部署设置了 FEATURE_WISHLIST_PREVIEW=on，开关关着前台也会显示需求墙；正式站不受影响。',
  turnOn: '开启需求墙',
  turnOff: '关闭需求墙',
  saving: '保存中…',
  saved: { on: '需求墙已开启', off: '需求墙已关闭' },
  dialog: {
    on: {
      title: '开启需求墙？',
      body: '开启后，登录用户的底部 tab 出现第四项「Wishlist」，可以提交需求和投票；后台导航出现「需求审核」；定价页和付费弹窗会列出需求墙权益。',
      confirm: '确认开启',
    },
    off: {
      title: '关闭需求墙？',
      body: '关闭后，Wishlist tab 消失，需求墙页面和提交、投票接口都返回 404，后台「需求审核」也隐藏。已有的需求和投票全部保留，重新开启后原样出现。',
      confirm: '确认关闭',
    },
    cancel: '取消',
  },
  errors: { invalid: '开关的值不对，请刷新页面后再试' },
} as const satisfies SwitchCopy & { previewOverride: string; errors: { invalid: string } }
