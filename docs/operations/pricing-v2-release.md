# New credit release

0960–0964 and 0970–0975 are inactive compatibility migrations. Installing them does not clear a wallet,
change a template, enable an affiliate program, create provider prices, or promote a site.

1. For this release the Owner requested the configured script and waived another end-to-end
   payment round. The verified **sandbox dry run** plans 21 versioned Stripe Prices on six
   existing Products; the 15 legacy Prices remain available. For a configured test account:

       NEXT_PUBLIC_PRICING_CATALOG_VERSION=v2 pnpm tsx --env-file=.env.local scripts/stripe-setup.ts --versioned-prices-only

   This is read-only. Applying it changes the specified Stripe catalog and needs a separate
   release authorization. Waffo keeps nine one-off and six recurring SKU mappings. Do not
   enable a channel before checking its actual configuration. Fixtures and dry runs do not
   prove that a third-party price was created or that a payment was made.
2. Rehearse the atomic release and original-term settlement with integration fixtures, including
   renewals, refunds, disputes and commission reversals. Expire any outstanding legacy
   checkout links and check live contracts and callbacks. Protect checkout and generation in
   the short cutover window. The separate preview activation keeps unrelated QA wallets.
3. Get release approval for the exact integrated commit and verified provider cutover. The
   production wallet authorization covers only the reviewed cohort and balances. The cohort must have
   no active contract or running job. History remains intact;
   both old pools end at zero. A user created before the switch never receives a new signup gift.
4. The restricted release workflow must run the following in one transaction after confirming
   the target project, versioned provider prices, blocked inflight writes, compatible app and
   template activation/rollback functions. Use the existing DB push (preview/production) workflow with an explicit manual pricing operation and reviewed main SHA. Ordinary pushes never activate it. This is a runbook, not an automatically executed
   migration. No direct remote SQL; use the reviewed repository release workflow. Apply a short
   lock timeout and abort if the baseline changes. For a future production activation, supply the separately reviewed snapshot in the
   protected environment secret `PRICING_V2_APPROVED_BASELINE`. Use a JSON object with
   `digest` (64 lowercase SHA-256 hex digits), `accounts`, `paid_credits`, `free_credits`,
   `last_ledger` and `payments` (nonnegative JSON integers). Only activation needs the secret.
   Missing, malformed or stale input aborts the cutover. Keep the approved values out of Git,
   dispatch inputs and workflow logs. Obtain fresh approval before changing the snapshot.

   Run the checked-in production or preview SQL selected by the workflow. The release
   also records the economic checkpoint used to refuse unsafe rollbacks; do not reproduce
   these steps as individual SQL statements.

5. Before promoting, use the target project environment to run
   `pnpm pricing:prepromote <immutable-production-candidate-url> v2`. Promote only when
   the candidate build, database host and active catalogue match. Revalidate template caches and open checkout and generation only on the verified version.
   Confirm exact version on all domains, new signup = 100, paid/free pools and historical
   documents unchanged except for the recorded closing entries. Compare checkout and job
   quotes, actual payment/credits, and new ledger totals.
6. Stop checkout on both channels, expire/close every still-payable v2 session and reconcile incoming or pending receipts. A late signed v2 charge against a v1 wallet is deliberately not granted: handle the webhook retry / alert against the original receipt. Before new economic activity, the restricted rollback transaction restores template
   snapshots and calls admin.restore_approved_wallets_v2(), then removes the version switch.
   Reverse adjustments reproduce the approved wallet digest. A failed check rolls back all
   three parts. After new transactions, pause new business and reconcile by original order;
   never apply a blanket reversal or restore a stale backup.


## Repeatable local checks

With a running local Supabase stack, run `pnpm exec vitest run --project pricing-release`.
For a nondefault local project set `SUPABASE_WORKDIR` to its directory. The test copies the
local database to a disposable database in the same Docker container. It observes the waiting
Postgres backend in both arrival orders, executes the checked-in preview SQL, checks replay,
refusal to undo a subsequent payment, and concurrent signup limits, then drops the copy.
CI runs it before the regular DB suite. A separate disposable copy exercises the production transaction against a synthetic approved cohort.
The DB suite tests late v2 payments on all settlement RPCs.

The two database workflows run pending migrations for normal pushes and a manual operation
of `none`. Selecting `activate` or `rollback` verifies migration history, main SHA and project
ref before executing only the corresponding release SQL. Each file is one atomic PostgreSQL DO block, compatible with the pinned CLI’s prepared query. After merging, inspect both automatic
migration runs before authorizing the first data operation.

The two-argument `admin_upsert_template(jsonb,jsonb)` remains the pricing and prompt writer.
Its column list preserves additional private prompt fields. T97's three-argument overload
must call this writer and update its own field within the same transaction.
