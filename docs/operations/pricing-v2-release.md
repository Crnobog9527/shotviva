# New credit release

0960–0963 are inactive compatibility migrations. Installing them does not clear a wallet,
change a template, enable an affiliate program, create provider prices, or promote a site.

1. Create separate versioned prices in Stripe/Waffo test mode; confirm amount, currency, product,
   recurrence and discounts from each hosted checkout and actual sandbox receipts. Keep legacy
   Price IDs and their callback routes. Archive or expire outstanding old checkout links and
   inspect provider-side open orders / recurring contracts. Do not move a live price or grant
   credits from a dashboard. A pending or unclassified order blocks the switch.
2. Rehearse against the validation site and an isolated population. Never use production's reset
   authorization to clear unrelated sandbox users. Replay old and new signed events across the
   boundary, including renewals, refunds, disputes and commission reversals. Match the money
   received and ledger entries. Feature-dependent checkout and generation must remain unavailable
   during the switch to avoid mixing units across stale deployments.
3. Get release approval for the exact integrated commit and verified provider cutover. The
   production wallet authorization covers **only** the six accounts in the reviewed digest:
   124 paid credits, 26 free credits, no active contract or running job. History remains intact;
   both old pools end at zero. A user created before the switch never receives a new signup gift.
4. The restricted release workflow must run the following in one transaction after confirming
   the target project, versioned provider prices, blocked inflight writes, compatible app and
   template activation/rollback functions. This is a runbook, not an automatically executed
   migration. No direct remote SQL; use the reviewed repository release workflow. Apply a short
   lock timeout and abort if the baseline changes. The production arguments below identify the
   reviewed snapshot; never substitute newly computed values without checking the difference.

       begin;
       set local lock_timeout='5s';
       select pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
       select admin.clear_approved_wallets_v2('d89a0d8be56fbceac43c362466620f5d53c150266f56eee1cf806d6a6b94d8b4',37,1);
       insert into public.system_settings(key,value,updated_at)
         values('pricing_catalog_version','"v2"',clock_timestamp());
       select admin.activate_template_price_catalog_v2();
       commit;

5. Revalidate template caches and open checkout and generation only on the verified version.
   Confirm exact version on all domains, new signup = 100, paid/free pools and historical
   documents unchanged except for the recorded closing entries. Compare checkout and job
   quotes, actual payment/credits, and new ledger totals.
6. Before new economic activity, the restricted rollback transaction restores template
   snapshots and calls admin.restore_approved_wallets_v2(), then removes the version switch.
   Reverse adjustments reproduce the approved wallet digest. A failed check rolls back all
   three parts. After new transactions, pause new business and reconcile by original order;
   never apply a blanket reversal or restore a stale backup.
