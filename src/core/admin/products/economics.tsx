'use client'
import { useState } from 'react'
import { MEMBERSHIP_TIERS, type MembershipTier } from '../../config'
import { bestPackOffer, packMemberPercentOff } from '../../billing/pack-price'
import { Input } from '../../ui/input'
import type { Editor, Terms } from './model'
import { E } from './editor-copy'

const C = { heading:'收款渠道毛利试算',channel:'支付渠道',payment:'支付费率（%）',fixed:'每笔固定手续费（USD）',
  use:'预计积分使用率（%）',cost:'每个已用积分的生成成本（USD）',basis:'生成成本默认使用既定预算，使用率默认 100%。可替换为业务实测值。',
  refund:'退款预留', commission:'适用最高佣金', source:'支付费与每笔固定费用请按该渠道的商户合同核对。',
  metrics:'当前毛利 → 草稿毛利',scenario:'收款方案',base:'普通价',member:'会员折扣',code:'活动码',actual:'经营毛利需用实际账单、佣金、退款与已消耗的积分成本对账。',
  unit:'每积分实收（USD）',input:'请填写该渠道费率和固定费', before:'当前', after:'草稿', fees:'固定成本预算', price:'订单实收（USD）',
} as const
type Params = { rate: string; fixed: string; use: string; cost: string; refund: number; commission: number }
type Scenario = { name: string; member: MembershipTier | null; coupon: number }
function scenarios(item: Editor): Scenario[] {
  const members = ['pack_m','pack_l'].includes(item.product_id) ? [null,...MEMBERSHIP_TIERS] : [null]
  return members.flatMap(member => [{ code: '', percent: 0 }, ...item.discounts].map(({ code, percent: coupon }) => {
    const name = [member ? C.member+' '+member+' '+packMemberPercentOff(member)+'%' : C.base, coupon ? C.code+' '+code+' ('+coupon+'%)' : ''].filter(Boolean).join(' / ')
    return {name, member, coupon}
  }))
}
function quote(id: Editor['product_id'], v: Terms | null, s: Scenario, input: Params) {
  if (!v) return { paid:E.empty,unit:E.empty,margin:E.empty }
  const paid = bestPackOffer({ id, priceUsd: v.usd_cents / 100 },s.member,s.coupon).cents / 100
  const fees = (Number(input.rate) + input.refund + input.commission)/100
  const margin = (paid*(1-fees)-Number(input.fixed)-v.credits*Number(input.cost)*Number(input.use)/100)/paid
  return {paid:paid.toFixed(2),unit:(paid/v.credits).toFixed(6),margin:(margin*100).toFixed(2)+'%'}
}
function numeric(value: string, max: number) {
  return value.trim() !== '' && Number.isFinite(Number(value)) && Number(value)>=0 && Number(value)<=max
}
function Estimate({ item, input }: { item: Editor; input: Params }) {
  const ready = numeric(input.rate,100) && numeric(input.fixed,1e6) && numeric(input.cost,1e6) && numeric(input.use,100)
  return <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{[C.scenario,C.price,C.unit,C.metrics].map(h=><th key={h}>{h}</th>)}</tr></thead>
    <tbody>{scenarios(item).map(s=>{
      const a=quote(item.product_id,item.current,s,input)
      const b=quote(item.product_id,item.draft,s,input)
      return <tr key={s.name} className="border-t"><th>{s.name}</th><td>{a.paid} → {b.paid}</td>
        <td>{a.unit} → {b.unit}</td><td>{ready ? a.margin+' → '+b.margin : C.input}</td></tr>
    })}</tbody></table></div>
}
export function Economics({ item }: { item: Editor }) {
  if (!item.budget || !item.fees) return <section><h2>{C.heading}</h2><p>请先配置后台成本策略，完成后可试算并发布。</p></section>
  return <ChannelEstimate item={item} budget={item.budget} fees={item.fees} />
}
function ChannelEstimate({ item, budget, fees }: { item: Editor; budget: number; fees: NonNullable<Editor['fees']> }) {
  const [channel,setChannel]=useState('Stripe')
  const [rate,setRate]=useState(String(fees.payment_bp/100))
  const [fixed,setFixed]=useState('')
  const [cost,setCost]=useState(budget.toFixed(10))
  const [use,setUse]=useState('100')
  const commission=fees.commission_bp/100
  const refund=fees.refund_bp/100
  return <section className="grid gap-2"><h2>{C.heading}</h2><p>{C.fees} · ${budget.toFixed(7)} / 积分</p>
    <p>{C.refund} {refund}% · {C.commission} {commission}%。{C.source}</p><p>{C.basis}</p>
    <div className="grid gap-2 sm:grid-cols-3"><label>{C.channel}<select value={channel} onChange={e=>{
      const c=e.target.value;setChannel(c);setRate(c==='Stripe'?String(fees.payment_bp/100):'');setFixed('')
    }}><option>Stripe</option><option>Waffo</option></select></label>
      <label>{C.payment}<Input type="number" min="0" max="100" value={rate} onChange={e=>setRate(e.target.value)} /></label>
      <label>{C.fixed}<Input type="number" min="0" value={fixed} onChange={e=>setFixed(e.target.value)} /></label>
      <label>{C.use}<Input type="number" min="0" max="100" value={use} onChange={e=>setUse(e.target.value)} /></label>
      <label>{C.cost}<Input type="number" min="0" value={cost} onChange={e=>setCost(e.target.value)} /></label></div>
    <Estimate item={item} input={{rate,fixed,cost,use,commission,refund}} /><p className="text-xs">{C.actual}</p></section>
}
