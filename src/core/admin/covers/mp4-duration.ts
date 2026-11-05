// Duration of an MP4 from its movie header (moov → mvhd), so the server can enforce the
// 15-second cap without a video decoder (there is no ffmpeg on Vercel; covers are not
// transcoded, ARCHITECTURE §8.3). null when the file has no readable header.

type Box = { type: string; start: number; end: number; body: number }

function readBox(view: DataView, offset: number, limit: number): Box | null {
  if (offset + 8 > limit) return null
  let size = view.getUint32(offset)
  const type = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset + 4, 4))
  let body = offset + 8
  if (size === 1) {
    if (offset + 16 > limit) return null
    size = Number(view.getBigUint64(offset + 8))
    body = offset + 16
  } else if (size === 0) {
    size = limit - offset
  }
  if (size < body - offset || offset + size > limit) return null
  return { type, start: offset, end: offset + size, body }
}

function findChild(view: DataView, start: number, end: number, type: string): Box | null {
  let offset = start
  while (offset < end) {
    const box = readBox(view, offset, end)
    if (!box) return null
    if (box.type === type) return box
    offset = box.end
  }
  return null
}

export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const moov = findChild(view, 0, bytes.byteLength, 'moov')
  const mvhd = moov && findChild(view, moov.body, moov.end, 'mvhd')
  if (!mvhd || mvhd.body + 32 > mvhd.end) return null
  const version = view.getUint8(mvhd.body)
  // version 1 has 64-bit creation / modification times and duration.
  const timescale = view.getUint32(mvhd.body + (version === 1 ? 20 : 12))
  const duration = version === 1 ? Number(view.getBigUint64(mvhd.body + 24)) : view.getUint32(mvhd.body + 16)
  return timescale > 0 ? duration / timescale : null
}
