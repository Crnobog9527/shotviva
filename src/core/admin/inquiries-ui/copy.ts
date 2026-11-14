import type {
  InquiryNeed,
  InquiryPlatform,
  InquiryStatus,
  InquiryUse,
  MonthlyVolume,
  StartTime,
  TeamSize,
} from '../../inquiries/rules'

// /admin/inquiries copy (DESIGN §7: Chinese only, kept out of site/messages). The choice names
// match the zh form (site/content/zh/pricing.ts) and are reused by the Feishu alert (T72).

const VOLUMES: Record<MonthlyVolume, string> = {
  under_100: '100 张以下',
  '100_500': '100–500 张',
  '500_2000': '500–2,000 张',
  '2000_10000': '2,000–10,000 张',
  over_10000: '10,000 张以上',
}

const USES: Record<InquiryUse, string> = {
  ecommerce: '电商商品图',
  food_menu: '外卖和菜单',
  social: '社交媒体内容',
  real_estate: '房产和民宿',
  ads: '广告和海报',
  other: '其他',
}

const PLATFORMS: Record<InquiryPlatform, string> = {
  taobao_tmall: '淘宝天猫',
  jd: '京东',
  pinduoduo: '拼多多',
  douyin: '抖音',
  xiaohongshu: '小红书',
  meituan_eleme: '美团饿了么',
  amazon: 'Amazon',
  shopify: 'Shopify',
  etsy: 'Etsy',
  ebay: 'eBay',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  other: '其他',
}

const NEEDS: Record<InquiryNeed, string> = {
  volume_pricing: '批量价格',
  custom_templates: '专属模板',
  bulk_processing: '大批量处理',
  api: 'API 接入',
  brand_kit: '品牌套件',
  invoicing: '发票和合同',
}

const TEAM_SIZES: Record<TeamSize, string> = { '1_5': '1–5 人', '6_20': '6–20 人', '21_100': '21–100 人', over_100: '100 人以上' }

const START_TIMES: Record<StartTime, string> = { asap: '尽快', within_1_month: '1 个月内', '1_3_months': '1–3 个月', exploring: '只是了解' }

const STATUSES: Record<InquiryStatus, string> = { new: '新咨询', contacted: '已联系', won: '已成交', closed: '无效或关闭' }

export const INQUIRIES_COPY = {
  title: '企业咨询',
  detailTitle: '企业咨询详情',
  empty: '还没有符合条件的企业咨询。',
  nextPage: '下一页 →',
  firstPage: '← 回到第一页',
  filters: { status: '状态', all: '全部' },
  columns: { createdAt: '提交时间', company: '公司', name: '姓名', email: '邮箱', volume: '每月出图量', uses: '用途', status: '状态' },
  fields: {
    name: '姓名',
    email: '工作邮箱',
    company: '公司或品牌',
    volume: '每月预计出图量',
    uses: '主要用途',
    message: '想了解或定制的内容',
    jobTitle: '职务',
    website: '网站或店铺链接',
    wechat: '微信号',
    phone: '手机号',
    teamSize: '团队人数',
    country: '国家或地区',
    platforms: '销售或发布平台',
    needs: '需要的能力',
    startTime: '预计开始时间',
    source: '来源',
    account: '提交时的账号',
    createdAt: '提交时间',
    updatedAt: '最后修改',
  },
  sources: { en: '英文价格页', zh: '中文价格页' },
  noAccount: '未登录',
  openUser: '打开用户详情 →',
  sections: { contact: '联系方式', company: '公司', needs: '需求', follow: '跟进' },
  edit: {
    status: '状态',
    note: '备注（只有你能看到）',
    notePlaceholder: '例如：11/9 已发邮件报价，等回复',
    save: '保存',
    saving: '保存中…',
    saved: '已保存',
  },
  writeEmail: '写邮件 →',
  copy: '复制',
  copied: '已复制',
  volumes: VOLUMES,
  uses: USES,
  platforms: PLATFORMS,
  needs: NEEDS,
  teamSizes: TEAM_SIZES,
  startTimes: START_TIMES,
  statuses: STATUSES,
  errors: {
    INVALID_INPUT: '请检查输入：备注不超过 2000 字。',
    NOT_FOUND: '这条咨询不存在。',
    generic: '保存失败，请稍后重试',
  },
} as const

export function inquiryErrorText(code: string): string {
  return code === 'INVALID_INPUT' || code === 'NOT_FOUND' ? INQUIRIES_COPY.errors[code] : INQUIRIES_COPY.errors.generic
}
