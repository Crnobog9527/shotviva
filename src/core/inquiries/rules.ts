// The business inquiry form's fixed choices and limits (DESIGN §6.9 item 8, ARCHITECTURE §10.c).
// Keys only: the page's words come from site/content, the admin's from its copy.ts. The same
// lists are check constraints in 0800, so changing one is a spec change and a migration.

export { INQUIRY_USES, MONTHLY_VOLUMES, type InquiryUse, type MonthlyVolume } from './summary-choices'
export const TEAM_SIZES = ['1_5', '6_20', '21_100', 'over_100'] as const
export const INQUIRY_PLATFORMS = [
  'taobao_tmall',
  'jd',
  'pinduoduo',
  'douyin',
  'xiaohongshu',
  'meituan_eleme',
  'amazon',
  'shopify',
  'etsy',
  'ebay',
  'instagram',
  'tiktok',
  'other',
] as const
export const INQUIRY_NEEDS = ['volume_pricing', 'custom_templates', 'bulk_processing', 'api', 'brand_kit', 'invoicing'] as const
export const START_TIMES = ['asap', 'within_1_month', '1_3_months', 'exploring'] as const
export const INQUIRY_STATUSES = ['new', 'contacted', 'won', 'closed'] as const

export type TeamSize = (typeof TEAM_SIZES)[number]
export type InquiryPlatform = (typeof INQUIRY_PLATFORMS)[number]
export type InquiryNeed = (typeof INQUIRY_NEEDS)[number]
export type StartTime = (typeof START_TIMES)[number]
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number]

// Character limits, the same as 0800's checks.
export const LIMITS = {
  name: 100,
  email: 254,
  company: 200,
  jobTitle: 100,
  website: 300,
  wechat: 64,
  phone: 32,
  country: 100,
  messageMin: 10,
  message: 1000,
  adminNote: 2000,
} as const

export const INQUIRY_PAGES = ['/pricing', '/zh/pricing'] as const
export type InquiryPage = (typeof INQUIRY_PAGES)[number]

// Why a batch on /admin/inquiries left an inquiry as it was.
export type BulkInquirySkip = 'missing' | 'same'
