import type { Translate } from '@/core/translate'
import { payoutMethods, type Account } from './models'

export function PayoutFields({ account, t, disabled }: { account: Account; t: Translate; disabled: boolean }) {
  return (
    <>
      <label>
        {t('method')}
        <select disabled={disabled} name="method" defaultValue={account.payout_method ?? ''}>
          <option value="">{t('notSet')}</option>
          {payoutMethods.map((method) => (
            <option key={method} value={method}>
              {t('methods.' + method)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('details')}
        <textarea disabled={disabled} name="details" rows={3} maxLength={2000} defaultValue={account.payout_details ?? ''} />
      </label>
      <label>
        {t('us')}
        <select disabled={disabled} name="us" required defaultValue={taxChoice(account.us_person)}>
          <option value="" disabled>
            {t('select')}
          </option>
          <option value="yes">{t('yes')}</option>
          <option value="no">{t('no')}</option>
        </select>
      </label>
    </>
  )
}

function taxChoice(us: boolean | null) {
  if (us === null) return ''
  return us ? 'yes' : 'no'
}
