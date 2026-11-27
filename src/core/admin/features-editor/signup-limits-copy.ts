// 2027: the per-IP sign-up and SMS limits on /admin/features (ARCHITECTURE §7). Chinese only, like
// the signup gift card next to it (DESIGN §7).
const PARTNER =
  '经企业的推广链接（企业账号的 ?ref 链接）进来的访客用这个上限代替上面那条：渠道商的业务员常在同一家店的 WiFi 下帮多位客户注册。同一网络的次数一起数，只是上限不同；不会比上面那条更严（取两条里较大的）。个人推广员的链接和没带链接的仍按上面那条。'

export const SIGNUP_LIMITS_COPY = {
  title: '注册与短信验证码限流',
  body: '同一个网络（同一个出口 IP）在一段时间内最多能发起几次邮箱注册、收几条短信验证码。超出后页面提示「操作太频繁」，账号注册不了，和注册赠送无关。保存后马上对下一次请求生效。每项填 1 到 10000 的整数，不能填 0（不提供「不限」）。',
  signupHourly: {
    label: '邮箱注册：同一网络每小时最多（次）',
    key: 'signup_request_ip_hourly',
    help: '默认 5。',
  },
  signupDaily: {
    label: '邮箱注册：同一网络每 24 小时最多（次）',
    key: 'signup_request_ip_daily',
    help: '默认 20。',
  },
  signupHourlyPartner: {
    label: '邮箱注册，经企业推广链接：同一网络每小时最多（次）',
    key: 'signup_request_ip_hourly_partner',
    help: `默认 20。${PARTNER}`,
  },
  signupDailyPartner: {
    label: '邮箱注册，经企业推广链接：同一网络每 24 小时最多（次）',
    key: 'signup_request_ip_daily_partner',
    help: `默认 100。${PARTNER}`,
  },
  smsDaily: {
    label: '短信验证码：同一网络每 24 小时最多（条）',
    key: 'sms_ip_daily',
    help: '默认 50。手机号注册、登录和「待领取」账号验证手机号都算。同一手机号 60 秒 1 条、每天 5 条的限制不变。',
  },
  smsDailyPartner: {
    label: '短信验证码，经企业推广链接：同一网络每 24 小时最多（条）',
    key: 'sms_ip_daily_partner',
    help: `默认 200。${PARTNER}`,
  },
  save: '保存限流',
  saved: '注册与短信验证码限流已保存',
  invalid: '每项都请填 1 到 10000 之间的整数',
} as const
