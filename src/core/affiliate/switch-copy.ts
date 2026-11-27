import type { SwitchCopy } from '@/core/admin/features-editor/switch-copy'

// The affiliate program's master switch (affiliate_settings.enabled), at the top of 联盟营销.
// Admin copy is Chinese only (DESIGN §7).
export const AFFILIATE_SWITCH_COPY: SwitchCopy = {
  title: '联盟营销总开关',
  key: 'affiliate_settings.enabled',
  body: '推广员计划的总开关。开着时接受推广员申请，推广链接带来的订单按规则记佣金，推广员在账号页看到自己的推广面板和链接。关着时不接受申请、不产生新佣金，推广员页面和账号页的推广面板都隐藏；已有的推广员、佣金和结算记录全部保留，重新开启后原样出现。保存后马上生效。',
  state: { on: '已开启', off: '已关闭' },
  stateLabel: '当前状态',
  lastChanged: (who: string, at: string) => `最后修改：${who} · ${at}（北京时间）`,
  someone: '未知账号',
  neverChanged: '这个开关不单独记录修改人和时间',
  turnOn: '开启联盟营销',
  turnOff: '关闭联盟营销',
  saving: '保存中…',
  saved: { on: '联盟营销已开启', off: '联盟营销已关闭' },
  dialog: {
    on: {
      title: '开启联盟营销？',
      body: '开启后马上接受推广员申请，推广链接带来的订单开始记佣金，推广员能在账号页看到推广面板。',
      confirm: '确认开启',
    },
    off: {
      title: '关闭联盟营销？',
      body: '关闭后不再接受申请、不再产生新佣金，推广员页面和账号页的推广面板隐藏。已有记录全部保留。这一页会只剩这个开关，重新开启后管理页原样出现。',
      confirm: '确认关闭',
    },
    cancel: '取消',
  },
}

// Shown under the switch while the program is off: the management tabs are hidden until it is on.
export const AFFILIATE_OFF_NOTE = '联盟营销现在关着，下面的管理页（申请审核、佣金、结算等）会在开启后出现。'
