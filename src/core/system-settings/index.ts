// Runtime switches stored in system_settings (ARCHITECTURE §15.6). Server-only reads; the
// registry is plain and safe anywhere.
export { cachedSystemSettings, loadSystemSettings, settingsOrDefaults, SETTINGS_LIFE, SYSTEM_SETTINGS_CACHE_TAG } from './read'
export { isSystemSettingKey, settingValue, SYSTEM_SETTINGS, type SystemSettingKey, type SystemSettingValues } from './registry'
