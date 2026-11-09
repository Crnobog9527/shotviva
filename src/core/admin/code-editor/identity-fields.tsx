
import { Input } from '../../ui/input'
import { COPY } from './copy'
import type { Existing, Policy, Preset } from './model'

type PresetProps = { editing: boolean; preset: Preset; change: (preset: Preset) => void }
export type GiftPool = 'free' | 'paid'

function PresetField({ editing, preset, change }: PresetProps) {
  if (editing && preset === 'gift') return null
  if (editing) return <label><input type="checkbox" checked={preset === 'both'}
    onChange={e => change(e.target.checked ? 'both' : 'promo')} /> {COPY.give}</label>
  return <label className="grid gap-1">{COPY.preset}<select value={preset} className="h-9 rounded-md border border-input bg-background px-2"
    onChange={e => change(e.target.value as Preset)}>
    {(['promo','gift','both'] as const).map(type => <option key={type} value={type}>{COPY[type]}</option>)}
  </select></label>
}

export function IdentityFields({ code, editing, preset, change, children }: PresetProps & { code: Existing; children: React.ReactNode }) {
  return <fieldset className="grid gap-4 rounded-lg border bg-card p-4">
    <legend className="px-1 font-semibold">{COPY.identity}</legend>
    <label className="grid gap-1">{COPY.code}<Input name="code" defaultValue={code.code} required pattern="[A-Za-z0-9]{4,20}" maxLength={20} /></label>
    <label className="grid gap-1">{COPY.note}<Input name="note" defaultValue={code.note ?? ''} /></label>
    <PresetField editing={editing} preset={preset} change={change} />{children}
  </fieldset>
}

export function GiftFields({ policy, changed, credits, setCredits, pool, setPool }: {
  policy: Policy; changed: boolean; credits: string; setCredits: (value: string) => void; pool: GiftPool; setPool: (value: GiftPool) => void
}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1">{COPY.credits}<Input type="number" name="credits" min={1} required value={credits}
      max={changed ? policy.maxCreditsPerCode : undefined} onChange={e => setCredits(e.target.value)} />
      <small>{COPY.giftLimit(policy.maxCreditsPerCode)}</small></label>
    <label className="grid content-start gap-1">{COPY.pool}<select className="h-9 rounded-md border border-input bg-background px-2"
      name="pool" value={pool} onChange={e => setPool(e.target.value as GiftPool)}>
      <option value="free">{COPY.free}</option><option value="paid">{COPY.paid}</option></select></label>
  </div>
}
