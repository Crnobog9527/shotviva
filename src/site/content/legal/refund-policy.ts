import { defineLegalPage } from '@/core/content'

import { LAST_UPDATED, contactSection, emailLink, entity, helpLink, legalLinks, operatorSentence } from './shared'

// Same rules as Graylum's refund policy (Owner 2026-11-05), rewritten for Shotviva's
// products: no founder plans or upgrades, yearly credits issued at once, requests through Help &
// feedback or by email, handled by hand in Stripe or Waffo (ARCHITECTURE §6.3, §10; T27 changed
// only how to ask, Owner 2026-11-06). Differences are listed in the T19 PR.
export const refundPolicyPage = defineLegalPage({
  path: legalLinks.refunds.href,
  title: `Refund Policy | ${entity.site}`,
  description: `When you can get a refund for a ${entity.site} membership or credit pack, and how to ask for one.`,
  h1: 'Refund Policy',
  label: 'Refund Policy',
  lastUpdated: LAST_UPDATED,
  intro: [
    operatorSentence,
    `This policy explains when you can get a refund for a purchase on ${entity.site}. ${entity.site} is a digital service: nothing physical is sold or shipped, so there is nothing to send back.`,
  ],
  sections: [
    {
      id: 'when',
      heading: 'When you can request a refund',
      blocks: [
        'You can request a refund if both of these are true:',
        {
          list: [
            'You ask within seven (7) days of the payment for your first purchase of a membership plan (monthly or yearly) or a credit pack; and',
            'None of the credits from that purchase have been used. This means that, since that payment, your account has not used any credits at all, including credits you had before and free credits we gave you.',
          ],
        },
        'Yearly plans: all of the credits for the year are added when you pay. If a refund is approved, all credits from that purchase are removed from your account.',
        'Membership bought with Alipay or WeChat Pay: this is a single payment for one period and does not renew. The same seven-day, no-credits-used rule applies.',
      ],
    },
    {
      id: 'not-refundable',
      heading: 'What is not refundable',
      blocks: [
        {
          list: [
            'Automatic renewal charges.',
            'Requests made more than seven (7) days after the payment.',
            'Purchases where credits from the purchase, or any credits at all since that payment, have been used.',
            'The rest of a subscription period after you cancel. When you cancel, the subscription stops renewing at the end of the current period, and no part of the period is refunded. Credits you already have stay on your account.',
          ],
        },
      ],
    },
    {
      id: 'how',
      heading: 'How to request a refund',
      blocks: [
        [
          'Sign in and open ',
          helpLink,
          ' on your account page, choose "Refund request" and pick the payment it is about. You can also email ',
          emailLink,
          ' from the email address on your account; include the date of the payment and what you bought (for example "Pro monthly" or "credit pack").',
        ],
        'A person reviews every request. If it is approved, we issue the refund through the payment provider that took your payment (Stripe or Waffo), back to the original payment method. Your bank or card issuer decides how long it takes to appear.',
      ],
    },
    {
      id: 'link',
      heading: 'Card payments sold by Link',
      blocks: [
        `Card, Apple Pay and Google Pay purchases may be sold to you by Link (part of Stripe) as the merchant of record. Checkout tells you when this is the case, and your card statement then shows "LINK.COM* ${entity.site.toUpperCase()}".`,
        `For these purchases you can ask us for a refund under this policy, or contact Link directly. Link handles refunds under its own terms, which may give you more than this policy does. If Link refunds a purchase, we remove the credits that purchase added to your account.`,
      ],
    },
    {
      id: 'fees',
      heading: 'Fees and taxes',
      blocks: [
        'Where the law allows, we deduct a fixed 6% handling fee from a refund we approve, calculated on the price before tax. Any tax you paid at checkout is refunded in full. Where the law does not allow the fee, we do not deduct it. A refund Link makes under its own terms follows Link’s rules.',
      ],
    },
    {
      id: 'other',
      heading: 'Other situations where we refund',
      blocks: [
        `If we shut down ${entity.site}, or permanently stop letting you use paid credits, we will refund the paid credits you have not used, based on the price you paid for them.`,
        'If we close your account without a legitimate reason, we will refund the paid credits you have not used, based on the price you paid for them, and stop any subscription.',
        [
          'If we close your account because you broke our ',
          legalLinks.terms,
          ' or ',
          legalLinks.acceptableUse,
          ' (including payment disputes made in bad faith), there is no refund, your credits are cancelled, and you may not open a new account.',
        ],
      ],
    },
    {
      id: 'credits',
      heading: 'Credits',
      blocks: [
        'Credits do not expire. A membership period can end, but the paid credits you already have stay on your account.',
      ],
    },
    {
      id: 'errors',
      heading: 'If you think you were charged in error',
      blocks: [
        [
          'If you believe you were charged twice or charged by mistake, email ',
          emailLink,
          ' first so we can look into it quickly, before you open a dispute with your bank.',
        ],
      ],
    },
    contactSection('this Refund Policy'),
  ],
})
