// Site-wide announcement banner (ARCHITECTURE §10). The admin side lives in core/admin;
// client components import the shared rules from './rules'.
export { AnnouncementBanner } from './banner/announcement-banner'
export { ANNOUNCEMENTS_CACHE_TAG, bannerState, loadBannerCandidates } from './banner-read'
export * from './rules'
