// Admin area (ARCHITECTURE §10): the template + prompt editor and the provider settings (T17).
export {
  bulkEditTemplates,
  listAdminTemplates,
  listImageProviderOptions,
  runAdminAction,
  runAdminQuery,
  saveTemplate,
  setFeaturedTemplates,
  setTemplatesFeatured,
  setTemplateActive,
  setTemplateOrder,
  deleteTemplate,
  setTemplatesActive,
} from './templates'
export type {
  ActionResult,
  ActionValue,
  ActiveChangeOutcome,
  AdminTemplate,
  ApplyCoverRequest,
  BulkEditOutcome,
  CoverTicket,
  CoverUploadRequest,
  FeaturedPlan,
  SaveTemplatePayload,
  TemplateAdminActions,
  TemplateOrderGroup,
} from './templates'
export { applyCover, createCoverUpload, publishStillCover, type ApplyCoverInput, type CoverDeps, type CoverUploadTicket } from './covers'
export { TemplatesEditor, type TemplatePreviewProps } from './templates-editor'
export {
  deleteTemplateCategory,
  listAdminCategories,
  reorderTemplateCategories,
  saveTemplateCategory,
  type AdminCategory,
  type CategoryAdminActions,
  type DeleteCategoryPayload,
  type SaveCategoryPayload,
} from './template-categories'
export { CategoriesPanel } from './template-categories-editor'
export { loadEditTemplateSettings, saveEditTemplate, type EditTemplateSettings, type SaveEditTemplateInput } from './edit-template'
export { EDIT_TEMPLATE_COPY, EditTemplateEditor } from './edit-template-editor'
export {
  activate as activateProvider,
  refreshProviderCapabilities,
  lookupProviderModel,
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
// The face-swap dry run beside the decision provider (ARCHITECTURE §5.1a, T81).
export { dryRunIdentityScreen, type DryRunResult } from './identity-dry-run'
export { IdentityDryRun } from './identity-dry-run-ui'
export { AdminPage, AdminShell, adminNavItems, EmptyState, SHELL_COPY, StatCard, type AdminNavItem } from './shell'
export {
  listPurchases,
  listSubscriptions,
  applyClawback,
  loadRevenueStats,
  ORDERS_COPY,
  OrdersView,
  previewClawback,
  paymentSource,
  stripeDashboardUrl,
  usd,
  type AdminPurchase,
  type AdminSubscription,
  type ClawbackPreview,
  type ClawbackResult,
  type RevenueStats,
} from './orders'
export { ClawbackButton, ClawbackStatus, type ClawbackActions } from './clawback-ui'
export { listAnnouncements, saveAnnouncement, setAnnouncementActive } from './announcements'
export { ANNOUNCEMENTS_COPY, AnnouncementsEditor, type AnnouncementAdminActions } from './announcements-editor'
export { decodeCursor, encodeCursor, PAGE_SIZE, type Page } from './cursor'
export {
  accountLabel,
  adjustUserCredits,
  banUser,
  ledgerPage,
  loadUser,
  loadUserExtras,
  LOOKUP_PARAM,
  lookupHref,
  lookupUser,
  listSignupClusters,
  parseClusterWindow,
  recentJobs,
  unbanUser,
  batchAdjustCredits,
  batchSetBanned,
  hasListFilters,
  listUsers,
  loadUserDetail,
  pageItems,
  parseUserFilters,
  usersHref,
  type BatchOutcome,
  type LedgerEntry,
  type UserDetail,
  type UserDetailData,
  type UserExtras,
  type UserFilters,
  type UserJob,
  type UserListPage,
  type UserListRow,
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
export {
  SuspiciousView,
  USERS_COPY,
  UserDetailView,
  UserDialogHost,
  UserLink,
  UsersListView,
  type UserAdminActions,
  type UserBatchActions,
  type UserDialogActions,
} from './users-ui'
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
  setFeatureInvite,
  type FeatureAccessDeps,
  type FeatureAccessInput,
  type FeatureSetting,
} from './features'
export {
  FEATURES_COPY,
  FeaturesEditor,
  SignupGiftCard,
  WISHLIST_SWITCH_COPY,
  type FeatureAdminActions,
  type GallerySwitchKey,
  type GallerySwitchState,
  type WishlistSwitchState,
} from './features-editor'
export {
  loadSettingSwitch,
  loadSignupGift,
  loadWishlistSwitch,
  saveSettingSwitch,
  saveSignupGiftCap,
  saveWishlistSwitch,
  type SignupGiftState,
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
  loadBills,
  loadProviderDailyCosts,
  loadOurDailyCosts,
  saveCostSettings,
  type CostKeyActions,
  type CostSettingsInput,
} from './costs'
export { parseFunnelDim, parsePageSort, parseRange, posthogProjectId, type FunnelDim, type PageSort, type Range } from './analytics'
export { ANALYTICS_COPY, AnalyticsView, parseView, RangeTabs, Unconfigured, ViewTabs, type AnalyticsQuery } from './analytics-ui'
export { GROWTH_COPY, GrowthView } from './growth-ui'
export {
  attachDisputeFile,
  createDisputeUpload,
  DISPUTES_COPY,
  listDisputes,
  reconcileSubmitted,
  saveDisputeText,
  sendDueReminders,
  submitDispute,
  type DisputeListItem,
  type DisputeUploadTicket,
} from './disputes'
export { DisputeDetail, DisputesList, toCard, type DisputeActions, type DisputeCard } from './disputes-ui'
