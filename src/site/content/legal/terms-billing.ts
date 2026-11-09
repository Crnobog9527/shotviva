import type { LegalSection } from '@/core/content'

import { emailLink, entity, legalLinks, pricingLink } from './shared'

// Terms of Service, part 2: payments, subscriptions, template requests, the Graylum
// connection and copyright complaints (ARCHITECTURE §6.2, §6.3, §14, §15.5).

export const termsBillingSections: readonly LegalSection[] = [
  {
    id: 'purchases',
    heading: 'Purchases and payment',
    blocks: [
      [
        'You can buy a membership plan (monthly or yearly) or a one-time credit pack. Current plans, prices and credit amounts are on our ',
        pricingLink,
        '. Prices are in US dollars. The price and number of credits for each pack are displayed before checkout. Taxes may be added at checkout.',
      ],
      'Payments are taken on pages hosted by our payment providers, Stripe and Waffo. We never see or store your full card number.',
      {
        list: [
          'Card, Apple Pay and Google Pay purchases may be sold to you by Link (part of Stripe) as the merchant of record. When checkout says so, Link is the seller of that purchase, Link’s terms also apply to it, Link calculates and collects the tax, and your statement shows Link’s name.',
          'Other purchases, including Alipay payments and payments through Waffo, are sold by us unless the checkout page names another seller.',
        ],
      },
      'Credits are added to your account once the payment is confirmed. We may refuse or cancel an order that looks fraudulent or abusive, and we may correct pricing mistakes, even after an order is placed; if we cancel an order you paid for, we refund it.',
      'We may change prices. A new price applies to new purchases, and to a subscription from its next renewal after we tell you about the change.',
    ],
  },
  {
    id: 'subscriptions',
    heading: 'Subscriptions and renewal',
    blocks: [
      'Membership plans paid by card, Apple Pay or Google Pay are subscriptions. They renew automatically at the end of each monthly or yearly period, at the price then in effect, until you cancel. By subscribing, you authorize us, or Link where it is the seller, to charge your payment method at each renewal without asking you again each time.',
      'Each successful payment, including each renewal, adds that plan’s credits to your account. A yearly plan adds the whole year’s credits at once.',
      'If a renewal payment fails, no credits are added. The payment provider may retry the charge; credits are added when a payment succeeds. Credits you already have stay on your account.',
      'You can cancel at any time with the "Manage subscription" link on your account page, which opens the billing portal of Stripe or Link. Cancelling stops future renewals; your current period runs to its end and is not refunded.',
      'Membership plans paid with Alipay, or through Waffo, are a single payment for one period. They do not renew; buy again when you want more.',
      [
        'Cancel any subscription before you delete your account. If you deleted your account without cancelling, email ',
        emailLink,
        ' and we will cancel it.',
      ],
    ],
  },
  {
    id: 'refunds',
    heading: 'Refunds',
    blocks: [
      [
        'Refunds are covered by our ',
        legalLinks.refunds,
        '. In short: you can ask within seven days of your first purchase of a plan or credit pack if no credits have been used since that payment; renewals are not refundable; a partly used purchase may, after review, be refunded in proportion to the credits you have not used.',
      ],
      'When a purchase is refunded, the credits it added are removed from your account, and a refunded membership ends right away (an automatically renewing one is cancelled).',
      'If you dispute a charge with your bank instead of contacting us, we remove the credits from that purchase and may suspend your account while the dispute is open. If the dispute is decided in our favour, the credits are returned.',
    ],
  },
  {
    id: 'acceptable-use',
    heading: 'Acceptable use',
    blocks: [
      [
        'You must follow our ',
        legalLinks.acceptableUse,
        ', which lists what you may not upload, create or do on the Service.',
      ],
    ],
  },
  {
    id: 'wishlist',
    heading: 'Template requests (Wishlist)',
    blocks: [
      'Once you have created at least one image, you can post a request for a new template, with a description and one to three reference images, and vote for other people’s requests.',
      'You are responsible for the reference images and descriptions you post, and you promise you have the right to share them. We review every request before it appears, and we may reject, hide or remove any request at any time without giving a reason.',
      'Other signed-in users can see requests on the Wishlist, shown with a shortened version of your display name.',
      'Posting a request does not oblige us to build that template. If we build a template that fits your request, or any other idea you send us, we may do so without paying you or crediting you.',
    ],
  },
  {
    id: 'graylum',
    heading: 'Connecting Graylum',
    blocks: [
      `Graylum is another service run by ${entity.company}. If you choose to connect your ${entity.site} account to Graylum, you allow Graylum to create images for you with ${entity.site} templates, using your ${entity.site} credits.`,
      `Images created through Graylum follow these Terms in the same way as images created on ${entity.site}, including the free work and paid work rules, and they appear among your works on ${entity.site}.`,
      [
        'What is shared between the two services is described in our ',
        legalLinks.privacy,
        '. You can disconnect Graylum at any time from your account page. Graylum’s own terms apply to your use of Graylum.',
      ],
    ],
  },
  {
    id: 'feedback',
    heading: 'Feedback',
    blocks: [
      'If you send us ideas, suggestions or feedback about the Service, we may use them for any purpose without paying you or crediting you.',
    ],
  },
  {
    id: 'copyright',
    heading: 'Copyright complaints',
    blocks: [
      [
        'We respect copyright. If you believe content on the Service infringes your copyright, email a notice to ',
        emailLink,
        ' with the subject "Copyright notice". Include:',
      ],
      {
        list: [
          'your name, address, phone number and email address;',
          'a description of the copyrighted work, and a link to or description of where the content appears on the Service;',
          'a statement that you believe in good faith that the use is not authorized by the copyright owner, its agent or the law;',
          'a statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act for the owner; and',
          'your physical or electronic signature.',
        ],
      },
      'We may remove the content and, where appropriate, close the accounts of people who repeatedly infringe.',
    ],
  },
]
