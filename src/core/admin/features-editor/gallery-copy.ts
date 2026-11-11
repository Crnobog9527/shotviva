import type { SwitchCopy } from './switch-copy'

// The public gallery switches on /admin/features (ARCHITECTURE §9, T108). Chinese only (DESIGN §7).
const shared = {
  state: { on: '已开启', off: '已关闭' },
  stateLabel: '当前状态',
  lastChanged: (who: string, at: string) => `最后修改：${who} · ${at}（北京时间）`,
  someone: '未知账号',
  saving: '保存中…',
} as const

export const GALLERY_SWITCH_COPY: SwitchCopy = {
  ...shared,
  title: '公开创作库',
  key: 'gallery_enabled',
  body: '/gallery 作品墙和 /g 作品页。只展示审核通过的公开作品。保存后马上生效，不用重新部署。',
  neverChanged: '还没改过，默认关闭',
  turnOn: '开启创作库',
  turnOff: '关闭创作库',
  saved: { on: '创作库已开启', off: '创作库已关闭' },
  dialog: {
    on: {
      title: '开启公开创作库？',
      body: '开启后，所有人都能打开 /gallery 和审核通过的作品页，网站页脚会出现「创作库」入口。没有审核通过的作品不会出现。请先在「创作库审核」页把待审作品处理完。',
      confirm: '确认开启',
    },
    off: {
      title: '关闭公开创作库？',
      body: '关闭后，/gallery、/g、/tag 全部返回 404，网站上所有指向它们的入口一起消失。作品、审核结果和举报都保留，重新开启后原样出现。',
      confirm: '确认关闭',
    },
    cancel: '取消',
  },
}

export const AUTO_APPROVE_SWITCH_COPY: SwitchCopy = {
  ...shared,
  title: '未被标记的作品自动通过',
  key: 'gallery_auto_approve',
  body: '公开作品先由 OpenAI 自动审核。关着时，没被标记的作品也要人工点通过才会出现在创作库；开着时直接通过。被标记的作品始终自动拒绝。',
  neverChanged: '还没改过，默认关闭（每张都要人工通过）',
  turnOn: '开启自动通过',
  turnOff: '关闭自动通过',
  saved: { on: '自动通过已开启', off: '自动通过已关闭' },
  dialog: {
    on: {
      title: '开启自动通过？',
      body: '开启后，新出的公开作品只要没被 OpenAI 标记，就直接进入创作库，不再等人工确认。自动审核认不出仇恨符号、未成年人和侵权内容，这些只能靠举报和事后下架。已经在待审队列里的作品不受影响。',
      confirm: '确认开启',
    },
    off: {
      title: '关闭自动通过？',
      body: '关闭后，新出的公开作品都要在「创作库审核」页人工通过才会出现。已经通过的作品不受影响。',
      confirm: '确认关闭',
    },
    cancel: '取消',
  },
}
