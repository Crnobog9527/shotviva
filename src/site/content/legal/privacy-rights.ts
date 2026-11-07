import type { LegalSection } from '@/core/content'

import { emailLink, entity } from './shared'

// Privacy Policy, part 3: retention, deletion and your rights (ARCHITECTURE §8.3, §13, §15.5).

export const privacyRightsSections: readonly [LegalSection, ...LegalSection[]] = [
  {
    id: 'retention',
    heading: 'How long we keep information',
    blocks: [
      {
        list: [
          'Uploaded photos you create an image from: kept with that image, so you can make it again at any time, until you delete the image or your account. We also keep a small copy (768 pixels on its longest side, without camera details or GPS location) to show next to the image on the photo page, for the same time.',
          'Uploaded photos you do not create an image from: deleted automatically 7 days after upload.',
          'Your works (created images): kept until you delete them or delete your account. When you delete a work, its image files (the image, its small copy and the photos it was made from) and the text you typed for it are deleted right away. We keep a short record of the job (template, size, credits used and dates) for your credit history and our accounts until you delete your account.',
          'Wishlist reference images: kept until the request is rejected or removed, or until you delete your account.',
          'Account details (including your phone number, if you signed in with one), credit records and your list of works: kept while your account exists.',
          'Sign-in code requests (a one-way hash of the phone number, the IP address and the time): deleted after two days.',
          'Help & feedback tickets (your messages and our replies): kept until you delete your account.',
          'Payment records: kept by our payment providers (Stripe, Link and Waffo) under their own retention rules, including for tax and accounting purposes, also after you delete your account.',
          'Server logs, analytics and error reports: kept only as long as we need them to run, secure and improve the Service, and then deleted.',
        ],
      },
      'Deleted information may stay in our database backups for a short time, until those backups are replaced.',
    ],
  },
  {
    id: 'delete',
    heading: 'Deleting your account',
    blocks: [
      'You can delete your account yourself on your account page. When you do, we delete your account details, your uploaded photos, your works (public and private), your Wishlist requests and reference images, your Help & feedback tickets, your credit records, and any Graylum connection. Unused credits are lost.',
      [
        'Deleting your account does not cancel a subscription by itself. Cancel it first with "Manage subscription" on your account page; if you already deleted your account, email ',
        emailLink,
        ' and we will cancel it.',
      ],
    ],
  },
  {
    id: 'security',
    heading: 'How we protect information',
    blocks: [
      'We use reasonable technical and organizational measures to protect your information. For example: photos and works are kept in private storage and shown only through short-lived signed links or after we check who is asking; payment details stay with our payment providers; and access to our systems is limited. No system is completely secure, so we cannot guarantee that your information will never be accessed without permission.',
    ],
  },
  {
    id: 'transfers',
    heading: 'Where information is processed',
    blocks: [
      `${entity.site} is run from the United States. Your information is stored and processed in the United States and in other countries where our service providers operate. When we transfer personal information from the European Economic Area, the United Kingdom or Switzerland, we rely on safeguards such as the European Commission’s Standard Contractual Clauses in our providers’ terms.`,
    ],
  },
  {
    id: 'children',
    heading: 'Children',
    blocks: [
      [
        `${entity.site} is not for anyone under 18, and we do not knowingly collect information from children. If you believe a child has given us personal information, email `,
        emailLink,
        ' and we will delete it.',
      ],
    ],
  },
  {
    id: 'rights',
    heading: 'Your privacy rights',
    blocks: [
      'Depending on where you live, including in California and other US states with privacy laws, and in the European Economic Area, the United Kingdom and Switzerland, you may have the right to:',
      {
        list: [
          'know what personal information we have about you and get a copy of it;',
          'correct information that is wrong;',
          'delete your information;',
          'object to or restrict some processing, and withdraw consent where we rely on it;',
          'opt out of the sale or sharing of personal information or targeted advertising (we do neither);',
          'not be treated differently for using any of these rights.',
        ],
      },
      [
        'You can delete your works or your whole account yourself in the Service. For any other request, email ',
        emailLink,
        ' from the email address on your account. We may need to confirm your identity before we act. You can use an authorized agent; we may ask for proof that they act for you. We answer within the time the law requires.',
      ],
      [
        'If we decline your request, you can appeal by replying to our answer or emailing ',
        emailLink,
        ' with the subject "Privacy appeal". If you are in the EEA, UK or Switzerland, you can also complain to your local data protection authority.',
      ],
    ],
  },
  {
    id: 'us-states',
    heading: 'More information for US residents',
    blocks: [
      'In the last 12 months we have collected these categories of personal information: identifiers (such as email address, account ID and IP address); commercial information (purchases and credit records); internet activity (usage analytics and logs); and content you provide (photos, text, created images and Wishlist requests). The sources, purposes and recipients are described above.',
      'We have not sold personal information, shared it for cross-context behavioral advertising, or used sensitive personal information to infer characteristics about anyone.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes to this policy',
    blocks: [
      'We may update this policy. We will change the "Last updated" date at the top, and for important changes we will give notice on the Service or by email before they take effect.',
    ],
  },
]
