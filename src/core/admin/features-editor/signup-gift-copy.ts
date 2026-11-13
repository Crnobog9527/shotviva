import type { SwitchCopy } from './switch-copy'

// The signup gift controls on /admin/features (1350, ARCHITECTURE §7). Chinese only (DESIGN §7).
export const SIGNUP_GIFT_COPY = {
  cap: {
    title: '注册赠送每日上限',
    key: 'signup_gift_daily_cap',
    body: '每个北京时间自然日最多给多少个新账号发注册赠分。发满后当天再注册的账号不送分，以后也不补发；付费不受影响。用到一半和用满时飞书各提醒一次。填 0 表示不送。',
    today: (granted: number, cap: number) => `今天（北京时间）已送 ${granted} / ${cap} 份`,
    label: '每日上限（份）',
    save: '保存上限',
    saved: (cap: number) => `已保存，每日上限 ${cap} 份`,
    invalid: '请填 0 到 100000 之间的整数',
  },
} as const

export const SIGNUP_GIFT_PAUSE_COPY: SwitchCopy = {
  title: '暂停注册赠送',
  key: 'signup_gift_paused',
  body: '开启后，新注册的账号一律不送注册赠分，以后也不补发；付费、登录和出图都不受影响。发现有人批量注册时用。保存后马上生效。',
  state: { on: '已暂停', off: '正常发放' },
  stateLabel: '当前状态',
  lastChanged: (who: string, at: string) => `最后修改：${who} · ${at}（北京时间）`,
  someone: '未知账号',
  neverChanged: '还没改过，默认正常发放',
  turnOn: '暂停发放',
  turnOff: '恢复发放',
  saving: '保存中…',
  saved: { on: '注册赠送已暂停', off: '注册赠送已恢复' },
  dialog: {
    on: {
      title: '暂停注册赠送？',
      body: '暂停期间注册的账号永远拿不到注册赠分（恢复后也不补发）。已经发出的赠分不受影响。',
      confirm: '确认暂停',
    },
    off: {
      title: '恢复注册赠送？',
      body: '恢复后，新注册的账号照常领取，仍受每日上限和同一网络 24 小时限领一次的限制。',
      confirm: '确认恢复',
    },
    cancel: '取消',
  },
}
