import 'server-only'
import type Stripe from 'stripe'
import { catalogReceipt } from '../catalog-receipt'
import { AppError } from '../../errors'
import type { RpcClient } from '../rpc'
import { exactShape, netUsd } from './contract-price'
import { invoiceTax } from './payment-facts'

function discounted(invoice: Stripe.Invoice, metadata: Stripe.Metadata) {
  const discounts = invoice.total_discount_amounts ?? []
  if (!discounts.some((d) => d.amount > 0)) return false
  const matching = (invoice.discounts ?? [])
    .filter((d) => typeof d !== 'string')
    .filter((d) => typeof d.source.coupon === 'object' && d.source.coupon?.metadata?.code_id === metadata.code_id)
    .map((d) => d.id)
  if (
    !metadata.code_id ||
    !discounts.every((d) => matching.includes(typeof d.discount === 'string' ? d.discount : d.discount.id))
  ) {
    throw new AppError('INVALID_INPUT', 'Unrecognized renewal discount')
  }
  return true
}

export async function boundInvoice(
  db: RpcClient,
  invoice: Stripe.Invoice,
  sub: string,
  meta: Stripe.Metadata,
  price: Stripe.Price,
) {
  if (price.unit_amount === null) throw new AppError('INVALID_INPUT', 'Missing contract price')
  const hasCoupon = discounted(invoice, meta)
  const percent = hasCoupon ? meta.catalog_discount_percent : '0'
  const product = await catalogReceipt(db, meta, {
    channel: 'stripe',
    priceId: price.id,
    unitCents: price.unit_amount,
    reference: invoice.id,
    contract: sub,
    renewal: true,
    discounted: hasCoupon,
    net: netUsd(price.unit_amount, invoice.amount_paid, invoiceTax(invoice), invoice.subtotal, invoice.currency, percent),
  })
  if (!exactShape(price, product, 'subscription'))
    throw new AppError('INVALID_INPUT', 'Invoice interval or SKU differs from the contract')
  return product
}
