// 更换主管理员 on /admin/orgs/<id> (1930). Admin pages are Chinese only (DESIGN §7).
export const TRANSFER_COPY = {
  title: '更换主管理员',
  hint: '把主管理员换成另一个账号，例如建企业时选错了人。新主管理员可以是本企业的在职成员，也可以是不在任何企业、未被封禁的已注册用户。原主管理员变成普通成员，需要的话再到主管理员控制台或这里的成员表里移除。',
  open: '更换主管理员',
  pickerLabel: '搜索新主管理员',
  current: '已是主管理员',
  confirmTitle: '确认更换主管理员？',
  confirmBody: (from: string, to: string) => `主管理员从 ${from} 换成 ${to}。`,
  staysTitle: '以下都属于企业，全部留在企业里，由新主管理员接管：',
  stays: [
    '企业联盟账号上的全部内容：待确认和已确认的佣金、结算和打款记录、收款账户、佣金比例（包括建企业时并入这个账号的原主管理员以前的个人联盟记录和客户）',
    '推广来的一级、二级客户，以及推广链接、邀请链接和企业推荐码',
    '每月推广积分发放记录',
    '企业积分池、积分流水、每个成员的月额度和已划拨积分',
    '原主管理员自己推广来的客户和业绩（仍记在他名下，作为企业成员的业绩）',
  ],
  personal: '原主管理员个人的购买、个人积分和个人邀请码不动，仍是他自己的；企业联盟账号上的东西他一样都不保留。',
  removesEmpty: '如果新主管理员自己有一个空的个人推广员账户（没有佣金、打款、调账、客户、下级推广员和专属比例），会被一并删除，删除记录写进操作日志。有推广记录的账号不能接任。',
  cancel: '取消',
  confirm: '确认更换',
  saving: '更换中…',
  done: (moved: { commissions: number; customers: number } | null, removed: { slug: string } | null = null) =>
    (moved ? `已更换主管理员；企业联盟账号已随企业转给新主管理员（佣金 ${moved.commissions} 条、客户 ${moved.customers} 个）` : '已更换主管理员')
      + (removed ? `；新主管理员原来空的个人推广员账户（${removed.slug}）已删除` : ''),
  already: '他已经是本企业的主管理员，没有重复更换',
  newOwnerAffiliate: '这个账号的推广员账户属于别的企业，不能当主管理员。请改选或先找技术处理',
  newOwnerAffiliateHistory: '这个账号已有个人推广员账户且有推广记录，不能直接接任主管理员',
  affiliateMismatch: '这家企业的联盟账号不在当前主管理员名下，没有更换。请先找技术处理',
  pickerHistory: '有带推广记录的个人推广员账户，不能接任',
  changed: '企业信息刚被改过，请刷新页面后再换',
  busy: '这家企业这会儿正好有付款、退款或客户绑定在处理，请过几秒再点一次「确认更换」',
} as const
