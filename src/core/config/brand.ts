import type { PostalAddress } from './define-site'

// "75 E 3rd St", "Sheridan, WY 82801", "United States": the order a US mailing address prints in.
export function addressLines(address: PostalAddress): [string, string, string] {
  return [address.street, `${address.locality}, ${address.region} ${address.postalCode}`, address.country]
}

export function formatAddress(address: PostalAddress): string {
  return addressLines(address).join(', ')
}
