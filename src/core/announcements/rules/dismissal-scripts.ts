import 'server-only'

import { BANNER_ELEMENT_ID, BANNER_KEY_ATTRIBUTE, CLOSED_STORAGE_KEY, KEY_PATTERN } from './dismissal'

// The two inline scripts the server writes into the banner's HTML. Server-only and apart from
// dismissal.ts, which the banner's client code imports: built at module load from the shared
// constants, they could not be dropped by the minifier and would ship in the client bundle.

// Runs in the static HTML right before the banner (outside its Suspense boundary, so it always
// comes first, whether the banner is in the shell or streams in later). It adds one <style> that
// hides every banner version this browser closed, so a closed banner never paints, not even for
// a frame before hydration. Constant text: nothing from the server is interpolated.
export const HIDE_CLOSED_SCRIPT =
  'try{var m=JSON.parse(localStorage.getItem(' +
  JSON.stringify(CLOSED_STORAGE_KEY) +
  ')||"{}"),n=Date.now(),c="",k;for(k in m)if(' +
  KEY_PATTERN.toString() +
  '.test(k)&&typeof m[k]=="number"&&(m[k]===0||m[k]>n))c+=".sv-ann[' +
  BANNER_KEY_ATTRIBUTE +
  '=\\""+k+"\\"]{display:none!important}";if(c){var s=document.createElement("style");s.textContent=c;document.head.appendChild(s)}}catch(_){}'

// Runs right after the banner: hides one whose end time passed after the cached HTML was made.
export const HIDE_ENDED_SCRIPT =
  'try{var e=document.getElementById(' +
  JSON.stringify(BANNER_ELEMENT_ID) +
  '),t=e&&e.getAttribute("data-ends-at");if(t&&Date.parse(t)<=Date.now())e.hidden=true}catch(_){}'
