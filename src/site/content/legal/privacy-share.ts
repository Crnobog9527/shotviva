import type { LegalSection } from '@/core/content'

import { entity } from './shared'

// Privacy Policy, part 2: who we share with, analytics and cookies (cookies by region, T70),
// error reports, and the Graylum connection (ARCHITECTURE §14, §16, TASKS T19 provider list).

const providers = [
  'Supabase: database and sign-in (accounts, credit records, works and orders).',
  'Cloudflare R2: storage for uploaded photos, created images and Wishlist reference images.',
  'OpenAI: creates images. We send it your photo, the template instructions and the text you entered. OpenAI processes this data under its API terms.',
  'Volcano Engine (Beijing Volcano Engine Technology Co., Ltd., mainland China): creates images for some templates. For those templates we send it your photo, any reference images, the template instructions and the text you entered, and it processes them on its servers in mainland China under its own terms.',
  'Stripe and Link: payments, subscriptions and billing portals. For card purchases where Link is the merchant of record, Link also receives your purchase details as the seller.',
  'Waffo: backup payment provider for one-time payments.',
  'PVUV.ai: website analytics (which pages are visited and where visitors come from) and the report of which pages automated crawlers fetch, described in "Analytics and cookies" below.',
  'Sentry: error reports, with email addresses, phone numbers and access tokens removed before they are sent.',
  'Resend: delivers account emails such as email confirmation and password reset.',
  'Vercel: hosts the website and runs our servers.',
  'hCaptcha: bot protection on the sign-up, sign-in and password reset pages (loaded when you open them) and on the business inquiry form. It processes device and interaction data under hCaptcha’s own privacy policy.',
  'Google: sign-in, if you choose "Continue with Google".',
  'An SMS service provider: delivers sign-in codes by text message to mainland China mobile numbers. It receives the phone number and the code.',
] as const

export const privacyShareSections: readonly [LegalSection, ...LegalSection[]] = [
  {
    id: 'share',
    heading: 'Who we share information with',
    blocks: [
      'We share personal information only with service providers that help us run the Service, and only what each one needs for its job:',
      { list: providers },
      'We may also share information if the law requires it, to protect people’s safety or our rights, or as part of a merger, sale or reorganization of our business, in which case this policy continues to apply to it.',
    ],
  },
  {
    id: 'analytics',
    heading: 'Analytics and cookies',
    blocks: [
      'We use PVUV.ai to understand how people use the Service: which pages are visited, which websites and campaign links bring visitors, and how visitors from those sources go on to sign up, create images and buy. For that, our pages and servers also send PVUV.ai a short record of each step (for example “signed up”, “created an image”, “started checkout”, “purchased”) with the plan, the payment method and, for a purchase, the amount paid, and, when you are signed in, your account ID. Its script is loaded from PVUV.ai’s servers after the page has loaded. Before anything is sent to PVUV.ai, our page removes everything after a question mark except campaign tags such as utm_source, removes anything after a # sign, and removes organization invitation links’ secret part, from both the page address and the address of the website that linked to it. It also sends basic details of your browser and device. It does not measure our admin pages, the pages you use while signed in or organization invitation links; when you sign in, only the name of the section (for example /generate) is reported with your account ID, so that your visits can be linked to your account.',
      'Our servers also tell PVUV.ai which pages automated crawlers, such as AI assistants and search engines, fetched. That report contains the crawler’s self-declared name, its IP address (used once to check the address against the crawler operator’s published ranges) and the page address. It is about the crawler’s request, not about a visitor’s browser.',
      'Whether PVUV.ai uses a cookie depends on where you visit from. We tell this from the country of your IP address, which our host provides with each request; we do not keep your IP address for this.',
      {
        list: [
          'Outside the European Union, the European Economic Area, the United Kingdom and Switzerland, the PVUV.ai script keeps a random identifier in first-party cookies and in your browser’s local storage (their names start with _pv), for up to about thirteen months (one of them keeps the address of the website that first linked you to us, as your browser reported it, on your device only), so that visits from the same browser can be seen as one path (for example from the first page you open to sign-up). A session cookie named sv_analytics_region, holding only "open", tells our pages that this applies.',
          'In the European Union, the European Economic Area, the United Kingdom and Switzerland, we ask first, with a bar at the bottom of the page. Until you choose "Accept", the PVUV.ai script is not loaded at all and nothing is stored in your browser. If you choose "Necessary only", it stays that way and we do not ask again. Your answer is kept in your browser’s local storage under sv_analytics_consent, and nothing else is stored with it.',
        ],
      },
      'You can change your choice at any time with "Cookie settings" at the bottom of our pages, wherever you are. Choosing "Necessary only" removes PVUV.ai’s cookies and stored data from your browser. You can also block or delete cookies in your browser’s settings.',
      'When you are signed in, analytics are linked to your account ID, not to your email address. Analytics never include your email address, your phone number, the text you entered, your photos, image links or template instructions. We do not record your screen or sessions.',
      'We do not use advertising cookies, tracking pixels or cross-site tracking. Apart from analytics, we use cookies only where they are needed to keep you signed in and, when you pick a language with the language switch, to remember that choice (a cookie named NEXT_LOCALE that holds only "en" or "zh", kept for one year and used for nothing else). Pages run by others, such as Stripe, Link or Waffo checkout, Google sign-in and the hCaptcha check, may set their own cookies under their own policies.',
      'Because we do not sell or share personal information for targeted advertising, there is nothing to opt out of. We still treat a Global Privacy Control signal from your browser as a valid opt-out request.',
    ],
  },
  {
    id: 'errors',
    heading: 'Error reports',
    blocks: [
      'When something breaks, Sentry receives an error report with technical details about the error and your browser, with email addresses, phone numbers and access tokens removed.',
    ],
  },
  {
    id: 'graylum',
    heading: 'Connecting Graylum',
    blocks: [
      `Graylum is another service run by our company. Connecting it is optional. If you connect your ${entity.site} account to Graylum:`,
      {
        list: [
          `${entity.site} shares with Graylum: your ${entity.site} account ID, your display name, how many paid and free credits you have left, and the end date of your membership period, if any.`,
          `Graylum sends ${entity.site} what is needed to create each image you ask for there: the template, the text you entered and, if you add one, a photo. ${entity.site} sends back a link to the created image.`,
          `Images created through Graylum are stored as your works on ${entity.site}, under this policy.`,
          `${entity.site} does not receive your Graylum password or Graylum sign-in tokens.`,
        ],
      },
      'You can disconnect Graylum at any time from your account page. After that, Graylum can no longer use your account. What Graylum does with information on its side is covered by Graylum’s own privacy policy.',
    ],
  },
]
