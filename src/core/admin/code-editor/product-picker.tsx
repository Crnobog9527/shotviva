import { discountedPriceCents } from '../../codes'
import { belowDiscountFloor } from '../../codes/admin'
import type { ProductId } from '../../config'
import { Button } from '../../ui/button'
import { COPY, PRODUCTS } from './copy'
import { type Catalog, pricePerCredit, productGroup } from './model'

type Props = { prices: Catalog; percent: number; chosen: ProductId[]; change: (ids: ProductId[]) => void; locked: boolean }
const groupNames = ['monthly','yearly','packs','all'] as const

export function ProductPicker({ prices: { catalog, floor }, percent, chosen, change, locked }: Props) {
  const valid = Number.isInteger(percent) && percent >= 1 && percent <= 90
  return <fieldset className="grid gap-3" disabled={locked}>
    <legend className="mb-2 font-medium">{COPY.products}</legend>
    {!locked && <div className="flex flex-wrap gap-2">{groupNames.map(group =>
      <Button key={group} type="button" variant="outline" size="sm" onClick={() => change(productGroup(catalog.map(p => p.id),group))}>{COPY[group]}</Button>)}</div>}
    <p className="text-sm text-muted-foreground">{COPY.floor(pricePerCredit(floor.priceCents,floor.credits))}</p>
    <table className="w-full text-left text-sm"><thead><tr className="border-b">
      {[COPY.target,COPY.unit,COPY.maxOff].map(title => <th key={title} className="py-2 font-medium">{title}</th>)}
    </tr></thead><tbody>{catalog.map(p => {
      const bad = valid && belowDiscountFloor(p,floor,percent)
      let max = 0
      while (max < 90 && !belowDiscountFloor(p,floor,max + 1)) max++
      return <tr key={p.id} className={'border-b' + (bad ? ' text-destructive' : '')}><td className="py-2">
        <label className="flex items-center gap-2"><input type="checkbox" name="products" value={p.id} checked={chosen.includes(p.id)}
          onChange={e => change(e.target.checked ? [...chosen,p.id] : chosen.filter(id => id !== p.id))} />{(PRODUCTS[p.id] ?? p.id)}</label></td>
        <td className="font-mono">{pricePerCredit(valid ? discountedPriceCents(p.priceCents,percent) : p.priceCents,p.credits)}
          {bad && <span className="ml-2 text-xs">{COPY.below}</span>}</td><td>{max}%</td></tr>
    })}</tbody></table>
  </fieldset>
}
