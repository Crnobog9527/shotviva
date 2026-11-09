import type { ProductId } from '../../config'

export const COPY = {
  create: '新建后台码', edit: '编辑后台码', cancel: '返回', save: '保存', busy: '保存中…',
  identity: '基本信息', code: '码（4～20 位英文字母或数字）', note: '备注', preset: '码的效果',
  promo: '优惠码', gift: '送积分码', both: '送积分并打折', credits: '赠送积分数量',
  pool: '积分池', free: '免费积分', paid: '付费积分', give: '同时赠送积分',
  giftLimit: (max: number) => `每次兑换最多赠送 ${max} 积分`,
  scope: '兑换条件', starts: '开始时间（北京时间）', ends: '截止时间（北京时间）',
  quota: '兑换总名额', quotaRequired: '当前配置要求赠送付费积分时填写总名额。', onlyNew: '仅限新用户',
  discount: '折扣设置', percent: '优惠百分比（减免比例）', period: '订阅折扣期', months: '持续月数',
  once: '仅首期', repeating: '前 N 个月', forever: '每一期', days: '兑换后有效天数',
  immutable: '折扣条款已固定。如需变更，请新建优惠码。', products: '适用商品',
  monthly: '全部月付', yearly: '全部年付', packs: '全部积分包', all: '全部商品',
  target: '商品', unit: '折后美元 / 积分', maxOff: '优惠上限', below: '低于下限',
  floor: (value: string) => `最低每积分实收 ${value}，按当前最便宜的订阅计算。`,
  noTargets: '请至少选择一个适用商品。', invalidPercent: '优惠百分比须为 1～90 的整数。',
  invalidTargets: (names: string[]) => `以下商品折后低于下限：${names.join('、')}`,
  already: '这个码已被使用，请换一个。', invalid: '请检查码、日期、名额和赠送设置。',
  endAfterStart: '截止时间必须晚于开始时间。', capped: '名额不能低于已兑换数量。',
  giftTooLarge: '赠送数量超过当前配置的上限。', denied: '当前账号没有保存权限。',
  failed: '保存失败，请重试。', locked: '已有优惠码的折扣条款不能更改。',
} as const

export const PRODUCTS: Record<ProductId, string> = {
  starter_monthly: '入门版月付', starter_yearly: '入门版年付', pro_monthly: '专业版月付', pro_yearly: '专业版年付',
  max_monthly: '旗舰版月付', max_yearly: '旗舰版年付', pack_s: '小积分包', pack_m: '中积分包', pack_l: '大积分包',
}
