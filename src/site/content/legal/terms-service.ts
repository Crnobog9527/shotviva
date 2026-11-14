import type { LegalSection } from '@/core/content'

import { emailLink, entity, legalLinks, pricingLink } from './shared'

// Terms of Service, part 1: the service, accounts, credits and works (ARCHITECTURE §5, §6.1, §6.2).

export const termsServiceSections: readonly [LegalSection, ...LegalSection[]] = [
  {
    id: 'agreement',
    heading: 'Agreement to these terms',
    blocks: [
      `These Terms of Service ("Terms") are a binding agreement between you and ${entity.company} about your use of ${entity.site}, including the website at ${entity.url}, your account, and any feature that links to these Terms (together, the "Service").`,
      [
        'By creating an account or using the Service, you agree to these Terms and to the policies they include: our ',
        legalLinks.privacy,
        ', ',
        legalLinks.refunds,
        ' and ',
        legalLinks.acceptableUse,
        '. If you do not agree, do not use the Service.',
      ],
      'If you use the Service for a business, you agree to these Terms on behalf of that business, and "you" includes the business.',
    ],
  },
  {
    id: 'eligibility',
    heading: 'Who can use the Service',
    blocks: [
      'You must be at least 18 years old to create an account or use the Service.',
      'You may not use the Service if you are barred from doing so under the laws that apply to you, or if we have closed an account of yours before for breaking these Terms.',
    ],
  },
  {
    id: 'service',
    heading: 'What the Service does',
    blocks: [
      `${entity.site} is an online photo studio. You upload a photo, choose a template, and the Service uses artificial intelligence ("AI") to create a new image from it (an "Output"). Templates cover uses such as food and drink, products, beauty, rooms and spaces, pets and art styles.`,
      'AI results vary. An Output may change details of your photo, contain mistakes, or look different from the template examples, and similar Outputs may be created for other users. Check every Output before you use or publish it. We do not promise any particular result, including more orders, sales, bookings or followers.',
      'We may add, change or remove templates and features at any time.',
    ],
  },
  {
    id: 'accounts',
    heading: 'Your account',
    blocks: [
      'You sign up with an email address and password, which you confirm by email, or with your Google account. We use a bot check (hCaptcha) at sign-up, sign-in and password reset.',
      'Give us accurate information, keep your password secret, and tell us right away if you think someone else has used your account. You are responsible for everything done through your account.',
      'One person may have one account. Accounts may not be shared, sold or transferred.',
    ],
  },
  {
    id: 'credits',
    heading: 'Credits',
    blocks: [
      'Creating an image uses credits. There are two kinds:',
      {
        list: [
          'Free credits: the credits we give new accounts and any credits we give in promotions. They can only create free works (see the next section).',
          'Paid credits: the credits you get from a membership plan or a credit pack. They create paid works.',
        ],
      },
      'When you create an image, we use paid credits first. If you do not have enough paid credits for that image, we use free credits instead, and the image is a free work. We never split one image between both kinds.',
      [
        'How many credits an image uses depends on the template and the resolution you choose, and is shown before you create it. Membership credits and credit pack sizes are shown on our ',
        pricingLink,
        '. Creating the same image again uses credits again.',
      ],
      'If an image fails, or our AI provider declines to create it, the credits are returned to your account automatically.',
      'Credits do not expire. Credits have no cash value, cannot be exchanged for money (except under our Refund Policy), and cannot be transferred to another account. We may correct a credit balance that is wrong because of an error.',
    ],
  },
  {
    id: 'works',
    heading: 'Free works and paid works',
    blocks: [
      'Whether an image is a free work or a paid work depends only on which credits created it, not on whether you have a membership.',
      {
        list: [
          `Free works are public. They carry a "Made with ${entity.site}" watermark and cannot be made private. You can delete them at any time. You may use free works for personal, non-commercial purposes, as long as you keep the watermark. Free works stay free works after you buy a membership or credits; to get a version without a watermark, create the image again with paid credits.`,
          'Paid works are private by default and have no watermark. You may use them for any lawful purpose, including commercial use such as menus, product listings, rental listings, ads and social media. You can choose to make a paid work public, and make it private again later.',
        ],
      },
      'Before you create an image with free credits, the Service tells you that it will be public.',
      'An ending membership or an empty credit balance does not change works you already created.',
    ],
  },
  {
    id: 'your-content',
    heading: 'Your photos and Outputs',
    blocks: [
      '"Your Content" means the photos you upload, the text you enter (such as titles, prices and notes), and the reference images and descriptions you post as template requests.',
      'You keep ownership of Your Content. As between you and us, and to the extent the law and our AI provider’s terms allow, you own the Outputs you create, subject to the free work rules above. The law on who owns AI-made images is still developing, and some Outputs may not be protected by copyright.',
      'You give us a worldwide, non-exclusive, royalty-free license to host, store, copy, process and display Your Content and your Outputs, only as needed to run the Service for you, keep it safe, and comply with the law. This includes sending your photos to our AI provider to create your Outputs.',
      'For public works (all free works, and any paid work you make public) you also give us a worldwide, non-exclusive, royalty-free license to show the work publicly on the Service, together with the template name and the text you entered, for example in a public gallery or as an example of a template. This license ends for a work when you delete it or make it private, except for copies already shared before then. We do not show the photos you uploaded or your email address with public works.',
      [
        'You are responsible for Your Content and for how you use your Outputs. You promise that you have all the rights and permissions needed to upload Your Content, including the permission of any person shown in it, and that Your Content and your use of the Outputs do not break the law, these Terms or our ',
        legalLinks.acceptableUse,
        '.',
      ],
      'We do not use your photos or Outputs to train AI models.',
    ],
  },
  {
    id: 'using-outputs',
    heading: 'AI-made images and using them in your business',
    blocks: [
      'Check before you use an Output. AI results can differ from your real product, dish or place, and the same template can give different results each time. Before you publish or use an Output, check it yourself. You decide whether and how to use it, whether that use is lawful, and whether you need to label it as AI-made under the law or the rules of the platform where you post it. We do not review Outputs before you use them.',
      'Using Outputs in your business. Shotviva is a tool. When you use an Output on a menu, a delivery app, a store listing, an ad or anywhere else, you are the seller or advertiser, not us. You alone are responsible for making sure it fairly shows what your customers will get. We are not a party to any dealings between you and your customers, the platforms you sell on, or regulators. Complaints, refunds, bad reviews, platform penalties or fines that come from an image not matching the real product are your responsibility.',
      'This includes images made with options you choose to turn on that change how your product looks, such as "Upgrade plating & tableware". The Service records when you turned such an option on.',
    ],
  },
  {
    id: 'responsibility',
    heading: 'Free works, likeness and your responsibility',
    blocks: [
      'Please read this section carefully. It explains what you agree to when you use free credits, and who is responsible for the people and the material in your photos.',
      {
        list: [
          'Public display is the condition of free credits. When you create an image with free credits, you agree that it is public and that we may show it publicly on the Service, together with its template name, for example in the public gallery and as an example of a template. This is the condition for using free credits. Before you create an image with free credits, the Service tells you so: "This photo uses free credits: it’s shown publicly with a watermark. Paid credits make it private and watermark-free." If you do not want an image shown publicly, create it with paid credits. You can still delete a free work at any time.',
          'Photos of people. If a photo or reference image you upload shows a real person, you must have that person’s permission before you upload it, and for a person under 18, the permission of their parent or legal guardian. You alone are responsible for any claim that comes from creating an image from that photo or from showing the image publicly, including claims about a person’s likeness, image or right of publicity, privacy or reputation, and you will indemnify us for such claims as described in "Indemnity" below.',
          'Intellectual property. If the material you provide (photos, reference images or text), or an image created from it, infringes someone else’s copyright, trademark or other intellectual property, the user who created that image is responsible for it and will indemnify us as described in "Indemnity" below. We may remove such images without notice, and we handle complaints about them as described in "Copyright complaints" below.',
        ],
      },
    ],
  },
  {
    id: 'our-ip',
    heading: 'Templates and our intellectual property',
    blocks: [
      `The Service, including its software, design, templates, template instructions, example images and the ${entity.site} name and logo, belongs to ${entity.company} or its licensors. These Terms give you a personal, non-exclusive, non-transferable right to use the Service as described here, and nothing more.`,
      'Art style templates describe general styles only. They are not made with, or affiliated with, any specific artist, studio, work, character or brand.',
      [
        'To use our name, logo or content in a way these Terms do not allow, ask us first at ',
        emailLink,
        '.',
      ],
    ],
  },
]
