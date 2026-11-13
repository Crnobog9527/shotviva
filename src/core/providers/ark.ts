import type { Resolution } from '../templates/output-options'

// Seedream on Volcano Engine Ark (火山方舟), the 'ark_images' adapter (ARCHITECTURE §3.3).
// Limits for doubao-seedream-5-5-261028, read 2026-11-13 from
// https://docs.volcengine.com/docs/82379/1541523:
//   - `size` as WxH: 1280x720 (921,600) ≤ pixels ≤ 2048x2048x1.1025 (4,624,220), ratio 1/16–16
//   - at most 10 reference images (`image`)
// The site's 4K tier (2880² ≈ 8.3 M pixels at 1:1) is above the model's cap, so only 1k and 2k.
export const ARK_RESOLUTIONS: readonly Resolution[] = ['1k', '2k']
export const ARK_MAX_REFERENCES = 10
export const ARK_MIN_PIXELS = 921_600
export const ARK_MAX_PIXELS = 4_624_220
