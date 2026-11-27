// /admin/features copy. The admin UI is Chinese only and is not localised, so its words live
// here rather than in site/messages (DESIGN §7, AGENTS §9).
export const FEATURES_COPY = {
  title: '功能开关',
  // The page's sections, in the order the Owner touches them most (Owner 2026-11-27).
  sections: {
    signup: { title: '注册与赠送', hint: '新账号第一次登录时送的积分，和防批量注册的限制。' },
    generation: { title: '出图功能', hint: '创作页和编辑器里可以单独开关的功能。' },
    site: { title: '前台功能', hint: '用户在网站上能看到的板块。' },
    speed: { title: '手机速度与缓存', hint: '让手机打开更快的缓存。手机上页面出问题时，先关这里。' },
    early: { title: '会员抢先用 / 内测', hint: '新功能可以先只给高档位会员用，或只给邀请的账号用（ARCHITECTURE §6.2「新功能抢先用」）。' },
  },
  overview: {
    title: '总览',
    hint: '每个开关现在的状态。点名字跳到它的卡片；要改请在卡片上改。',
    columns: { name: '开关', section: '分区', state: '状态' },
    emergency: '紧急',
    affiliateSection: '联盟营销页',
    affiliate: '联盟营销总开关',
    on: '已开启',
    off: '已关闭',
  },
  intro: '新功能可以先只给高档位会员用（ARCHITECTURE §6.2「新功能抢先用」）。这里只管谁能用；功能开不开看上面的开关。',
  empty: '目前没有其他新功能',
  emptyBody: '新功能在代码的功能注册表里登记后，会出现在这里。',
  who: '谁能用',
  openAt: '哪天起对所有人开放（北京时间）',
  tiers: { all: '所有人', pro: 'Pro 起', max: '仅 Max' },
  openAtHint: '留空表示一直按上面的档位限制',
  openAtDisabled: '所有人都能用时不需要',
  save: '保存',
  saving: '保存中…',
  saved: (name: string) => `已保存「${name}」`,
  invites: {
    intro: '内测功能：只有下面这些账号（和管理员）能用。按登录用的邮箱或手机号添加。',
    none: '还没有邀请任何账号',
    account: '邮箱或手机号',
    placeholder: 'name@example.com 或 13800000000',
    add: '邀请',
    remove: '移除',
    added: '已邀请',
    removed: '已移除',
  },
  errors: {
    invalid: '填写的内容不对，请检查后再保存',
    unknownFeature: '没有这个功能，请刷新页面',
    noAccount: '找不到这个邮箱或手机号对应的账号，请确认对方已注册',
  },
} as const
