'use client'

import { useEffect } from 'react'

const HREF = '/marketing-styles/content-ab17d6d99047e548.css'
const ID = 'commercial-later-styles'

// Start the lower-page stylesheet during parsing without making it render-blocking. The client
// effect also covers navigation from another page, where inserted script elements do not run.
const INSERT = `(function(){if(document.getElementById('${ID}'))return;var l=document.createElement('link');l.id='${ID}';l.rel='stylesheet';l.media='print';l.onload=function(){l.media='all'};l.href='${HREF}';document.head.appendChild(l)})()`

export function CommercialLaterStyles() {
  useEffect(() => {
    if (document.getElementById(ID)) return
    const link = document.createElement('link')
    link.id = ID
    link.rel = 'stylesheet'
    link.href = HREF
    document.head.appendChild(link)
  }, [])
  return <>
    <link rel="preload" as="style" href={HREF} />
    <script dangerouslySetInnerHTML={{ __html: INSERT }} />
    <noscript><link rel="stylesheet" href={HREF} /></noscript>
  </>
}
