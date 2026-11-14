// What the browser uses of Sentry, and nothing else. `import('@sentry/nextjs')` keeps every
// export of the package (Session Replay and rrweb included, ~100 KB gzip more than the static
// import used to bundle), because a dynamic import of a package can't be tree-shaken. Importing
// this file instead lets the bundler drop the rest, as it did before the SDK moved after load.
export { captureException, captureMessage, captureRouterTransitionStart, init, withScope } from '@sentry/nextjs'
