// Choices on the affiliate application. The stored values are stable keys (and ISO 3166-1
// alpha-2 country codes); the form and the admin both turn them into words.

export const channelTypes = [
  'xiaohongshu', 'douyin', 'wechat', 'bilibili', 'weibo', 'zhihu',
  'youtube', 'tiktok', 'instagram', 'x', 'facebook',
  'website', 'newsletter', 'community', 'clients', 'other',
] as const
export type ChannelType = (typeof channelTypes)[number]

// Mainland platforms first on the Chinese page, global ones first elsewhere.
const globalFirst: readonly ChannelType[] = [
  'youtube', 'tiktok', 'instagram', 'x', 'facebook',
  'xiaohongshu', 'douyin', 'wechat', 'bilibili', 'weibo', 'zhihu',
  'website', 'newsletter', 'community', 'clients', 'other',
]
export const channelOrder = (locale: string): readonly ChannelType[] => (locale === 'zh' ? channelTypes : globalFirst)

export const audienceRanges = ['under_1k', '1k_10k', '10k_50k', '50k_200k', 'over_200k', 'not_followers'] as const
export type AudienceRange = (typeof audienceRanges)[number]

export const countryCodes = [
  'AD', 'AE', 'AF', 'AG', 'AL', 'AM', 'AO', 'AR', 'AT', 'AU', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ',
  'BN', 'BO', 'BR', 'BS', 'BT', 'BW', 'BY', 'BZ', 'CA', 'CD', 'CF', 'CG', 'CH', 'CI', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU',
  'CV', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FM', 'FR', 'GA',
  'GB', 'GD', 'GE', 'GH', 'GM', 'GN', 'GQ', 'GR', 'GT', 'GW', 'GY', 'HK', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IN',
  'IQ', 'IR', 'IS', 'IT', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LC', 'LI',
  'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MR', 'MT',
  'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NE', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NZ', 'OM', 'PA', 'PE', 'PG', 'PH',
  'PK', 'PL', 'PS', 'PT', 'PW', 'PY', 'QA', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SI', 'SK', 'SL',
  'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SY', 'SZ', 'TD', 'TG', 'TH', 'TJ', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV',
  'TW', 'TZ', 'UA', 'UG', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VN', 'VU', 'WS', 'YE', 'ZA', 'ZM', 'ZW',
] as const

// Country or region name in the reader's language; an older free-text answer is shown as written.
export function countryName(value: string, locale: string): string {
  if (!/^[A-Z]{2}$/.test(value)) return value
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(value) ?? value
  } catch {
    return value
  }
}

export function countryOptions(locale: string) {
  const collator = new Intl.Collator(locale)
  return countryCodes.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) => collator.compare(a.name, b.name))
}
