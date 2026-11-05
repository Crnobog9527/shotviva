// Graylum connector, Shotviva side (ARCHITECTURE §14). Server-side entry; the account page's
// block lives in './ui'. partner-types.ts is the contract copied to Graylum.
export * from './partner-types'
export { CONNECT_PAGE_PATH, connectPagePath, handleConnectAuthorize, type ConnectAuthorizeDeps } from './connect-authorize'
export { fetchPartnerImage, type FetchLike } from './fetch-image'
export { handleGenerate, type PartnerGenerateRouteDeps } from './generate-handler'
export { handleAccount, handleJob, handleLink, handleTemplates, type PartnerRouteDeps } from './handlers'
export { exchangeLinkCode, issueLinkCode, LINK_CODE_TTL_MS, readLinkStatus, revokeLink, type LinkStatus } from './link-code'
export { assertPartnerKey, configuredPartnerKey, PARTNER_KEY_PREFIX, type PartnerKeyEnv } from './partner-auth'
export { partnerErrorResponse, PartnerError, toPartnerErrorBody } from './partner-error'
export { maskEmail, PARTNER_IMAGE_URL_SECONDS } from './partner-views'
export { allowlistedUrl, connectRedirectUrl, parseConnectRequest, pricingReturnTarget, topUpUrl } from './return-to'
