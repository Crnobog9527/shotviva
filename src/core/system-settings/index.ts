// Runtime switches stored in system_settings (ARCHITECTURE §15.6). Server-only reads; the
// registry is plain and safe anywhere.
export { cachedSystemSettings, loadSystemSettings, settingsOrDefaults, SETTINGS_LIFE, SYSTEM_SETTINGS_CACHE_TAG } from './read'
export { signupGiftCredits } from './signup-gift-credits'
export { isSystemSettingKey, SIGNUP_GIFT_CREDITS_MAX, SIGNUP_GIFT_CREDITS_MIN, settingValue, SYSTEM_SETTINGS, type SystemSettingKey, type SystemSettingValues } from './registry'
export { FOOD_TOGGLES_SWITCH_TAG, foodTogglesEnabled, foodTogglesOrOff } from './food-toggles'
export { SERVICE_WORKER_SWITCH_TAG, serviceWorkerEnabled, serviceWorkerOrOff, serviceWorkerShellEnabled } from './service-worker-switch'
