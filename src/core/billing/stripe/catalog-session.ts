import 'server-only'
import type Stripe from 'stripe'

import { catalogReceipt, hasCatalogReceipt } from '../catalog-receipt'
import type { SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { readQuote } from '../read-quote'
import type { RpcClient } from '../rpc'
import { matchesContractPrice } from './prices'
import type { CheckoutForm } from './catalog'
import { exactShape, legacyPrice, netUsd } from './contract-price'

async function legacySession(
  db: RpcClient,
  products: readonly SiteProduct[],
  price: Stripe.Price,
  form: CheckoutForm,
  meta: Stripe.Metadata,
) {
  const product = products.find((p) => p.id === meta.product_id)
  if (!product || matchesContractPrice(price, product, form, readQuote(meta, product))) return null
  return (await legacyPrice(db, price, product, form, meta)) ? product : null
}

function frozenLine(session: Stripe.Checkout.Session, meta: Stripe.Metadata) {
  const items = session.line_items
  const line = items?.data[0]
  if (
    !line?.price ||
    line.price.unit_amount === null ||
    line.quantity !== 1 ||
    items!.has_more ||
    items!.data.length !== 1 ||
    session.client_reference_id !== meta.user_id
  )
    throw new AppError('INVALID_INPUT', 'Invalid frozen purchase')
  return { price: line.price, cents: line.price.unit_amount }
}

function subscriptionId(session: Stripe.Checkout.Session) {
  const sub = session.subscription
  return typeof sub === 'string' ? sub : (sub?.id ?? null)
}

export async function sessionContract(
  db: RpcClient,
  session: Stripe.Checkout.Session,
  products: readonly SiteProduct[],
  record: boolean,
) {
  const meta = session.metadata ?? {}
  const form = session.mode === 'subscription' ? 'subscription' : 'one_time'
  if (!hasCatalogReceipt(meta)) {
    const price = session.line_items?.data[0]?.price
    return price ? legacySession(db, products, price, form, meta) : null
  }
  const { price, cents } = frozenLine(session, meta)
  const contract = subscriptionId(session)
  const net = sessionNet(session, cents)
  const product = await catalogReceipt(db, meta, {
    channel: 'stripe',
    priceId: price.id,
    unitCents: cents,
    contract,
    reference: session.id,
    renewal: false,
    discounted: Boolean(meta.code_id),
    record,
    net,
  })
  if (!exactShape(price, product, form))
    throw new AppError('INVALID_INPUT', 'Billed Product or interval differs from the contract')
  return product
}

function sessionNet(session: Stripe.Checkout.Session, cents: number) {
  const original = session.currency_conversion
  const tax = session.total_details?.amount_tax ?? 0
  if (original?.source_currency === 'usd' && tax === 0) return original.amount_total
  return netUsd(
    cents,
    session.amount_total,
    tax,
    session.amount_subtotal,
    session.currency,
    session.metadata?.catalog_discount_percent ?? '0',
  )
}
