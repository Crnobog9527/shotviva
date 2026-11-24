import type { EditCases, ImageRef } from '@/core/content'

// Hotels and stays on the home page (Owner 2026-11-24: restaurants and hotels are who the site
// is for, and the page had no block on what a hotel photo becomes). Four real pairs cut from the
// covers of published Rooms & Spaces templates, 16:9 (public/home/hotel-<scene>-{photo,ai}.webp):
// Hotel Room Night, Indoor Pool Night, Outdoor Night and Lobby Night 3D Render.
export const space = (file: string, alt: string): ImageRef => ({ src: `/home/${file}.webp`, alt, width: 1280, height: 720 })

export const homeSpaces: EditCases = {
  heading: 'Hotel and Rental Photos: Rooms, Lobbies and Pools Shot on a Phone',
  intro:
    'A room shot at night, a grey evening by the pool, a lobby lit by the ceiling lights: upload the phone photo and pick a hotel template. The layout, the furniture and the view stay where they are; the light and the mood become what booking sites and your own website need.',
  labels: { before: 'Phone', after: 'AI', reference: 'Reference' },
  items: [
    {
      title: 'Guest room at night',
      change: 'Hotel Room Night 3D Render: the same bed, bench and window, now in warm, even lamplight.',
      before: space('hotel-room-photo', 'Real phone photo: a hotel room at night, dim light, a bed with a bench and a dark window'),
      after: space('hotel-room-ai', 'Real example: the same room in warm, even lamplight, the bedding crisp and the mountains visible outside'),
    },
    {
      title: 'Indoor pool',
      change: 'Indoor Pool Night 3D Render: the same pool hall, the water clear and the stone walls lit.',
      before: space('hotel-pool-photo', 'Real phone photo: a hotel indoor pool at night, the hall dim and the water dark'),
      after: space('hotel-pool-ai', 'Real example: the same indoor pool with clear blue water and lit stone walls'),
    },
    {
      title: 'Pool terrace at dusk',
      change: 'Outdoor Night 3D Render: the same terrace and loungers, now at a warm sunset.',
      before: space('hotel-outdoor-photo', 'Real phone photo: a hotel pool terrace on a grey evening by the sea'),
      after: space('hotel-outdoor-ai', 'Real example: the same pool terrace and loungers at a warm sunset over the sea'),
    },
    {
      title: 'Lobby at night',
      change: 'Lobby Night 3D Render: the same lobby and front desk, in warmer, brighter light.',
      before: space('hotel-lobby-photo', 'Real phone photo: a hotel lobby with a wooden ceiling at night, the light flat'),
      after: space('hotel-lobby-ai', 'Real example: the same lobby and front desk in warmer, brighter light'),
    },
  ],
}
