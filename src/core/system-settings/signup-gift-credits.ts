import 'server-only'

import { cachedSystemSettings } from './read'
import { settingValue, type SystemSettingValues } from './registry'

type Read = () => Promise<SystemSettingValues>

// The signup gift's amount as the site states it (system_settings signup_gift_credits, 2008): the
// one reader every page, metadata and component that names the number goes through. It rides the
// shared settings cache, which the admin save expires (updateTag), so a change shows site-wide on
// the next request without a deploy. A failed read gives the default (100), as the grant itself
// does with no row. Only the copy reads this; the grant takes the amount in SQL.
export async function signupGiftCredits(read: Read = cachedSystemSettings): Promise<number> {
  return settingValue(await read(), 'signup_gift_credits')
}
