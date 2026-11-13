// Rendered widths of the covers in the app, for their srcset (core/ui/cover-image). Measured from
// the layout: 16 / 32 / 40 px gutters and the 1120 px content column (globals.css), the Create
// grid (one card a row on phones, two from md, three from lg, 16 px gaps), the 1040 px creation
// dialog with its 46% sample column and 24 px padding (create-sheet.tsx) and the workspace stage
// (lg up only, at most 632 px: image-workspace.tsx). A "plate" is one half of the side-by-side
// pair; a "frame" is the whole picture (a loop, the drag compare).
export const COVER_SIZES = {
  cardPlate: '(min-width: 1024px) 182px, (min-width: 768px) 25vw, 50vw',
  cardFrame: '(min-width: 1024px) 364px, (min-width: 768px) 50vw, 100vw',
  // The Art Styles compare spans two rows from md: taller than wide, so a 3:4 cover fills it by
  // height and shows about 1.2 times the card's width.
  artCard: '(min-width: 1024px) 440px, (min-width: 768px) 60vw, 100vw',
  // Create's All sections (Owner 2026-11-12): a phone rail card is the row less 4rem (about 279 px
  // on a 375 phone, so a plate is about 38vw); from md the rail is the ordinary grid row. A section
  // of drag compares is two columns on phones and three from md (336 px each from lg).
  railPlate: '(min-width: 1024px) 182px, (min-width: 768px) 25vw, 38vw',
  railFrame: '(min-width: 1024px) 364px, (min-width: 768px) 50vw, 75vw',
  artSection: '(min-width: 1024px) 336px, (min-width: 768px) 30vw, 44vw',
  featurePlate: '(min-width: 1024px) 560px, 50vw',
  featureFrame: '(min-width: 1024px) 1120px, 100vw',
  dialogPlate: '(min-width: 768px) 215px, 50vw',
  dialogFrame: '(min-width: 768px) 430px, 100vw',
  // A series member's thumbnail in the creation panel (member-picker.tsx): four across in the
  // dialog's sample column, a 104 px strip tile on phones.
  memberPlate: '(min-width: 768px) 48px, 52px',
  memberFrame: '(min-width: 768px) 96px, 104px',
  stagePlate: '316px',
  stageFrame: '632px',
} as const

// The feature card's loop is the widest frame: its video poster needs more than the default.
export const FEATURE_POSTER_WIDTH = 1920
