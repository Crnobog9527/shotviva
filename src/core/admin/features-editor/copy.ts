// /admin/features copy. The admin UI is Chinese only and is not localised, so its words live
// here rather than in site/messages (DESIGN §7, AGENTS §9).
export const FEATURES_COPY = {
  title: '功能权限',
  switchesHeading: '功能开关',
  gatesHeading: '新功能谁能用',
  intro: '新功能可以先只给高档位会员用（ARCHITECTURE §6.2「新功能抢先用」）。这里只管谁能用；功能开不开看上面的开关。',
  empty: '暂时没有可设置的功能',
  emptyBody: '新功能在代码的功能注册表里登记后，会出现在这里。',
  who: '谁能用',
  openAt: '哪天起对所有人开放（北京时间）',
  tiers: { all: '所有人', pro: 'Pro 起', max: '仅 Max' },
  openAtHint: '留空表示一直按上面的档位限制',
  openAtDisabled: '所有人都能用时不需要',
  save: '保存',
  saving: '保存中…',
  saved: (name: string) => `已保存「${name}」`,
  errors: {
    invalid: '填写的内容不对，请检查后再保存',
    unknownFeature: '没有这个功能，请刷新页面',
  },
} as const
