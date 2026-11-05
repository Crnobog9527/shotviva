// Client-safe part of the announcements module: shared by the admin form, the server read and
// the banner. The root index also exports server-only pieces.
export { DISMISS_STORAGE_KEY, isAllowedLink, isBannerHiddenPath, isLive, LINK_LABEL_MAX, localize, MESSAGE_MAX, pickLive } from './rules'
export { activationInputSchema, adminRowSchema, announcementInputSchema, bannerRowSchema, TONES, type AnnouncementInput } from './schema'
export type { AdminAnnouncementRow, AnnouncementRow, AnnouncementTone, BannerAnnouncement, BannerLocale } from './types'
