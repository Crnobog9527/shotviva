// How long an auth email link works: otp_expiry in supabase/config.toml ([auth.email], seconds),
// set the same in the cloud project. The reset pages quote it ("It works for one hour").
export const EMAIL_LINK_SECONDS = 3600
export const EMAIL_LINK_HOURS = EMAIL_LINK_SECONDS / 3600
