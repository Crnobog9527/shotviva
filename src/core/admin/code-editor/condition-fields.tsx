import { Input } from '../../ui/input'
import { COPY } from './copy'
import { type Existing, localDate } from './model'

export function ConditionFields({ code, quota, setQuota, needsCap }: {
  code: Existing; quota: string; setQuota: (value: string) => void; needsCap: boolean
}) {
  return <fieldset className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
    <legend className="px-1 font-semibold">{COPY.scope}</legend>
    <label className="grid gap-1">{COPY.starts}<Input type="datetime-local" name="starts" defaultValue={localDate(code.starts_at)} /></label>
    <label className="grid gap-1">{COPY.ends}<Input type="datetime-local" name="ends" defaultValue={localDate(code.expires_at)} /></label>
    <label className="grid gap-1">{COPY.quota}<Input type="number" name="quota" min={Math.max(1,code.redemption_count)}
      value={quota} required={needsCap} onChange={e => setQuota(e.target.value)} />{needsCap && <small>{COPY.quotaRequired}</small>}</label>
    <label className="flex items-center gap-2"><input type="checkbox" defaultChecked={code.new_users_only} name="onlyNew" />{COPY.onlyNew}</label>
  </fieldset>
}
