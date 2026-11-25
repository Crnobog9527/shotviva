import type { ImageRef, SpaceCases } from '@/core/content'

// Hotels and stays on the home page (Owner 2026-11-24: restaurants and hotels are who the site
// is for, and the page had no block on what a hotel photo becomes). Four real pairs cut from the
// covers of published Rooms & Spaces templates, 16:9 (public/home/hotel-<scene>-{photo,ai}.webp):
// Hotel Room, Hotel Restaurant and Hotel Lobby 3D Render and Hotel Outdoor Space (the Owner's pick,
// 2026-11-25). Each case names its template: while it is live, the page shows the template's own
// covers instead (home-spaces-live.ts), and these files are the fallback.
export const HOTEL_TEMPLATES = {
  room: 'hotel-render-gate-20261117',
  restaurant: 'hotel-render-gate-2026-copy-f0aa5f75-43a9-4fe7-b3fa-0dfa5d60b0e1',
  outdoor: 'hotel-outdoor-space',
  lobby: 'hotel-render-gate-2026-copy-18f154bc-836c-4239-82bb-058b475ebdbe',
} as const
export const space = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 1280, height: 720 })

export const homeSpaces: SpaceCases = {
  heading: 'Hotel and Rental Photos: Rooms, Lobbies and Pools Shot on a Phone',
  intro:
    'Rooms, restaurants, pools and lobbies shot on a phone often come out grey and flat: upload the phone photo and pick a hotel template. The layout, the furniture and the view stay where they are; the light and the finish become what booking sites and your own website need.',
  labels: { before: 'Real phone photo', after: 'AI', reference: 'Reference' },
  viewer: { open: 'View {title} full size', close: 'Close', previous: 'Previous', next: 'Next', counter: '{n} of {total}' },
  items: [
    {
      title: 'Guest room',
      template: HOTEL_TEMPLATES.room,
      change: 'Hotel Room 3D Render: the same bed, bench and window, the room brighter and the mountains outside sharper.',
      before: space('hotel-room-day-photo', 'Real phone photo: a hotel room by day, the light grey, a bed with a bench and snowy mountains outside'),
      after: space('hotel-room-day-ai', 'Real example: the same room in soft, bright light, the bedding crisp and the mountains clear'),
    },
    {
      title: 'Restaurant',
      template: HOTEL_TEMPLATES.restaurant,
      change: 'Hotel Restaurant 3D Render: the same tables and chandeliers, a brighter room and an evening glow on the mountains.',
      before: space('hotel-restaurant-photo', 'Real phone photo: a hotel restaurant under a timber roof, the light dim, mountains outside'),
      after: space('hotel-restaurant-ai', 'Real example: the same restaurant in warm light, the mountains outside lit by the evening glow'),
    },
    {
      title: 'Pool terrace',
      template: HOTEL_TEMPLATES.outdoor,
      change: 'Hotel Outdoor Space: the same pool, loungers and umbrellas, the sunset over the sea clearer.',
      before: space('hotel-terrace-photo', 'Real phone photo: a seaside hotel pool terrace on a grey evening'),
      after: space('hotel-terrace-ai', 'Real example: the same pool terrace with clear water and a warm sunset over the sea'),
    },
    {
      title: 'Lobby',
      template: HOTEL_TEMPLATES.lobby,
      change: 'Hotel Lobby 3D Render: the same lobby, sofas and front desk, a cleaner stone floor and clearer light.',
      before: space('hotel-lobby-day-photo', 'Real phone photo: a tall hotel lobby with crystal chandeliers and city towers outside'),
      after: space('hotel-lobby-day-ai', 'Real example: the same lobby with a polished floor and bright, clear light'),
    },
  ],
}
