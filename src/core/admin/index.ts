// Admin area (ARCHITECTURE §10): the template + prompt editor and the provider settings (T17).
export {
  listAdminTemplates,
  reorderTemplates,
  runAdminAction,
  runAdminQuery,
  saveTemplate,
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
export {
  activate as activateProvider,
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
  estimateCosts,
  filtersHref,
  JOBS_COPY,
  JobsView,
  listJobs,
  listTemplateOptions,
  parseJobFilters,
  type AdminJob,
  type JobFilters,
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
