# Ark relay

Vercel's functions reach Volcano Engine Ark (cn-beijing only) across the border, and the connect
phase sometimes times out (`UND_ERR_CONNECT_TIMEOUT`). This relay runs inside Volcano Engine's
network and passes two Ark calls through unchanged:

- `POST /<RELAY_SECRET>/api/v3/images/generations`
- `GET  /<RELAY_SECRET>/api/v3/models`

Everything else returns 404. The caller's `Authorization` header (the Ark key) is forwarded as is;
the relay stores no key. A connect-phase failure to Ark is retried once (the body never reached
Ark, so it cannot bill twice); a later failure returns 502, and no answer within 300 s returns 504.

## Deploy (veFaaS web app, Node 20)

1. Upload `relay.mjs` and `server.mjs`; start command `node server.mjs`; port 8000.
2. Env: `RELAY_SECRET` = a random string of 24+ characters (`openssl rand -hex 24`).
3. Function timeout 300 s; API gateway trigger timeout 300 s (or off). Both must stay above
   Shotviva's 240 s provider deadline.
4. Check: `GET https://<host>/<secret>/api/v3/models` without a key returns Ark's 401
   `AuthenticationError`; any other path returns 404 `RelayNotFound`.

## Switch Shotviva to it

Admin, providers, the Seedream row: set the base URL to `https://<host>/<secret>/api/v3`, run the
connection test, save. To undo, set it back to `https://ark.cn-beijing.volces.com/api/v3`.
No deploy is needed either way. The secret is the first path segment, so it is in that row and
also in the veFaaS and API gateway access logs; keep those logs to the account owner, and rotate
the secret (new env value, then the row) if it leaks. The Ark key travels in a header and is not logged.
