// Set the natural ratio after load, including when the browser used a cached image before hydration.
export function setImageRatio(image: HTMLImageElement) {
  if (image.naturalWidth && image.naturalHeight) {
    // A plate is 4:5, so 125% of the natural width/height ratio fills its height.
    image.style.setProperty('--image-width', `${125 * image.naturalWidth / image.naturalHeight}%`)
  }
}
