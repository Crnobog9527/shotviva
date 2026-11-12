// Client-safe part of the announcements module: shared by the admin form, the server read and
// the banner. The root index also exports server-only pieces.
export { isAllowedLink, isBannerHiddenPath, isLive, LINK_LABEL_MAX, localize, MESSAGE_MAX, pickLive, RESHOW_DAYS_MAX } from './rules'
export { CLOSED_STORAGE_KEY, isClosed, parseClosed, recordClose, versionKey } from './dismissal'
export { activationInputSchema, adminRowSchema, announcementInputSchema, bannerRowSchema, TONES, type AnnouncementInput } from './schema'
export type { AdminAnnouncementRow, AnnouncementRow, AnnouncementTone, BannerAnnouncement, BannerLocale } from './types'
