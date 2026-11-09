// The two choices the Owner's alert and the business_inquiry_submit event carry (volume band and
// uses), on their own: the analytics event dictionary ships on every page, the other inquiry lists
// (core/inquiries/rules) only with the form.
export const MONTHLY_VOLUMES = ['under_100', '100_500', '500_2000', '2000_10000', 'over_10000'] as const
export const INQUIRY_USES = ['ecommerce', 'food_menu', 'social', 'real_estate', 'ads', 'other'] as const

export type MonthlyVolume = (typeof MONTHLY_VOLUMES)[number]
export type InquiryUse = (typeof INQUIRY_USES)[number]
