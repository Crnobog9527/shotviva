import type { EditCases } from '@/core/content'

import { caseImage } from './landing-shared'

// "Edit text in an image with one sentence" on the home page (Owner 2026-11-11, shotviva-docs#7):
// four cases of its own, not the image-to-image page's, in which only the words change. The
// instruction in each line is the kind of sentence a user writes; every name in them is made up.
export const textEdits: EditCases = {
  heading: 'Edit Text in an Image With One Sentence',
  intro:
    'Upload a picture, or open one you made here, and write one line such as “change the dates to Nov 22 to 24”. Only those words change: the same typeface and size, no warped or garbled letters, and the rest of the picture stays as it was.',
  labels: { before: 'Before', after: 'After', reference: 'Reference' },
  items: [
    {
      title: 'Four lines on a shop poster',
      change: '“Make it our first anniversary, 30% off, Nov 22 to 24, at number 26.” Four lines rewritten in the poster’s own typefaces; the photo and the layout are untouched.',
      before: caseImage('text-poster-en-before', 'AI example: a tea shop poster for Green Haze Tea, Grand Opening, 20% off all drinks, Nov 15 – Nov 17, 18 Maple Street, over two iced fruit teas'),
      after: caseImage('text-poster-en-after', 'AI example: the same poster now reading First Anniversary, 30% off all drinks, Nov 22 – Nov 24, 26 Maple Street, in the same typefaces'),
    },
    {
      title: 'A new size on the label',
      change: '“Change it to Eau de Toilette, 100 ml.” The bottle label and the box both update in the same engraved serif; every other letter stays.',
      before: caseImage('text-perfume-before', 'AI example: a perfume bottle and box for a made-up brand on travertine, labelled Eau de Parfum, 50 ml'),
      after: caseImage('text-perfume-after', 'AI example: the same bottle and box, the label and box now reading Eau de Toilette, 100 ml'),
    },
    {
      title: 'New prices on a chalkboard',
      change: '“Latte 4.40, pour-over 5.80, and call the oat latte Maple Oat Latte.” The new chalk lettering is in the same hand.',
      before: caseImage('text-chalk-en-before', 'AI example: a hand-lettered café chalkboard headed Today’s Coffee with four coffees and their prices'),
      after: caseImage('text-chalk-en-after', 'AI example: the same chalkboard with two new prices and Maple Oat Latte, written in the same chalk hand'),
    },
    {
      title: 'A new name on the shop sign',
      change: '“Rename the sign Little Moon Noodle Bar.” The same lettering and glow; the street around it stays as it was shot.',
      before: caseImage('text-sign-en-before', 'Example phone photo: a noodle shop at night on a wet street, its red lightbox sign reading Nonna’s Noodle Bar, Hand-pulled since 1998'),
      after: caseImage('text-sign-en-after', 'AI example: the same street and shop, the sign now reading Little Moon Noodle Bar in the same lettering'),
    },
  ],
}
