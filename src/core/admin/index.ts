// Admin area (ARCHITECTURE §10): the template + prompt editor and the provider settings (T17).
export {
  listAdminTemplates,
  reorderTemplates,
  runAdminAction,
  runAdminQuery,
  saveTemplate,
  setFeaturedTemplates,
  setTemplateActive,
} from './templates'
export type {
  ActionResult,
  ActionValue,
  AdminTemplate,
  ApplyCoverRequest,
  CoverTicket,
  CoverUploadRequest,
  SaveTemplatePayload,
  TemplateAdminActions,
} from './templates'
export { applyCover, createCoverUpload, type ApplyCoverInput, type CoverDeps, type CoverUploadTicket } from './covers'
export { TemplatesEditor } from './templates-editor'
export { loadEditTemplateSettings, saveEditTemplate, type EditTemplateSettings, type SaveEditTemplateInput } from './edit-template'
export { EDIT_TEMPLATE_COPY, EditTemplateEditor } from './edit-template-editor'
export {
  activate as activateProvider,
  removeProvider,
  runProviderAction,
  saveProvider,
  testProvider,
  type ProviderActionResult,
  type ProviderAdminActions,
  type ProviderCommandDeps,
  type SaveProviderInput,
} from './providers'
export { PROVIDERS_COPY, ProvidersEditor } from './providers-editor'
export { AdminPage, AdminShell, adminNavItems, EmptyState, SHELL_COPY, StatCard, type AdminNavItem } from './shell'
export {
  listPurchases,
  listSubscriptions,
  loadRevenueStats,
  ORDERS_COPY,
  OrdersView,
  paymentSource,
  stripeDashboardUrl,
  usd,
  type AdminPurchase,
  type AdminSubscription,
  type RevenueStats,
} from './orders'
export { listAnnouncements, saveAnnouncement, setAnnouncementActive } from './announcements'
export { ANNOUNCEMENTS_COPY, AnnouncementsEditor, type AnnouncementAdminActions } from './announcements-editor'
export { decodeCursor, encodeCursor, PAGE_SIZE, type Page } from './cursor'
export {
  adjustUserCredits,
  banUser,
  ledgerPage,
  loadUser,
  loadUserExtras,
  lookupHref,
  lookupUser,
  listSignupClusters,
  parseClusterWindow,
  recentJobs,
  searchUsers,
  unbanUser,
  type AdminUserRow,
  type LedgerEntry,
  type UserDetail,
  type UserExtras,
  type UserJob,
} from './users'
export {
  costSummary,
  legacyEstimate,
  modelCosts,
  filtersHref,
  JOBS_COPY,
  JobsView,
  listJobs,
  listTemplateOptions,
  parseJobFilters,
  type AdminJob,
  type CostSummary,
  type JobFilters,
  type UnitCost,
} from './jobs'
export {
  DASHBOARD_DAYS,
  loadDashboardStats,
  loadTodoCounts,
  OVERVIEW_COPY,
  OverviewView,
  successRate,
  type DashboardStats,
  type ModelUsage,
  type StatsWindow,
  type TodoCounts,
} from './overview'
export { SuspiciousView, USERS_COPY, UserDetailView, UsersSearch, type UserAdminActions } from './users-ui'
export {
  compensateJob,
  listStuckJobs,
  refundStuckJobs,
  viewWork,
  type Compensation,
  type RefundOutcome,
  type StuckJob,
  type WorkLinks,
} from './support'
export { JobActions, StuckJobsPanel, SUPPORT_COPY, type JobSupportActions, type RefundStuck } from './support-ui'
export { applyStripeReplay, previewStripeReplay, type ReplayDeps } from './replay'
export { REPLAY_COPY, ReplayPanel, type ReplayActions } from './replay-ui'
export {
  listFeatureSettings,
  saveFeatureAccess,
  type FeatureAccessDeps,
  type FeatureAccessInput,
  type FeatureSetting,
} from './features'
export { FEATURES_COPY, FeaturesEditor, WISHLIST_SWITCH_COPY, type FeatureAdminActions, type WishlistSwitchState } from './features-editor'
export {
  loadWishlistSwitch,
  saveWishlistSwitch,
  type SystemSettingDeps,
  type WishlistSwitch,
  type WishlistSwitchInput,
} from './system-settings'
export {
  clearCostSettings,
  COSTS_CACHE_TAG,
  COSTS_COPY,
  COSTS_DAYS,
  CostsView,
  loadAdminKeyStatus,
  loadBilled,
  loadOurDailyCosts,
  saveCostSettings,
  type CostKeyActions,
  type CostSettingsInput,
} from './costs'
