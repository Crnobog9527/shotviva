import type { SwitchCopy } from './switch-copy'

// The signup gift controls on /admin/features (1350, ARCHITECTURE §7). Chinese only (DESIGN §7).
export const SIGNUP_GIFT_COPY = {
  rules: {
    title: '注册赠送规则',
    body: '新账号第一次登录时发注册赠分。下面几条规则保存后马上对下一个新账号生效；付费、登录和出图都不受影响。',
    today: (granted: number, cap: number) => `今天（北京时间）已送 ${granted} / ${cap} 份`,
    cap: {
      label: '每日上限（份）',
      key: 'signup_gift_daily_cap',
      help: '每个北京时间自然日最多给多少个新账号发注册赠分。发满后，当天再注册的账号不送，以后也不补发。用到一半和用满时飞书各提醒一次。填 0 表示不送。',
    },
    perIp: {
      label: '同一网络每 24 小时最多（份）',
      key: 'signup_gift_per_ip',
      help: '同一个网络（同一个出口 IP，比如同一间办公室、同一个校园网、同一部手机的流量）24 小时内最多有几个新账号能直接领到注册赠分。超出的账号不会被拒绝，而是记为「待领取」：它们在账号页验证一个手机号或 Google 账号后就能领。填 0 表示不限。',
    },
    claim: {
      label: '「待领取」的账号可以用这些方式领取',
      phone: '验证手机号',
      phoneKey: 'signup_gift_claim_phone',
      google: '用 Google 账号',
      googleKey: 'signup_gift_claim_google',
      help: '每个手机号、每个 Google 账号一辈子只能领一次注册赠分（账号注销后也不能再领）。领取时同样受上面的每日上限和「暂停注册赠送」限制，名额满了账号会继续等着，第二天还能领。两个都关掉，「待领取」的账号就领不到了。',
    },
    save: '保存规则',
    saved: '注册赠送规则已保存',
    invalid: '每日上限请填 0 到 100000 之间的整数，同一网络上限请填 0 到 1000 之间的整数',
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
