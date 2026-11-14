# QA personas and one-click login (T24)

Local scripts for browser validation on the preview site set up fixed test identities and
create a one-time sign-in link for each, so nobody has to type an
email, solve the hCaptcha or go through Google to switch accounts.

They only ever run against the preview Supabase project `shotviva-preview`
(`pnzkiqvktkzznfbyhphe`). The default site is the validation preview
`https://shotviva-git-validation-preview-simons-projects-bfe3e99f.vercel.app`.

## Setup (Owner, once)

1. Supabase → project **shotviva-preview** → **Settings → API Keys**. Copy the
   **service_role** key (legacy tab), or create a **secret** key (`sb_secret_…`).
2. Put it in `.env.local` at the repo root, and nowhere else:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://pnzkiqvktkzznfbyhphe.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<the preview service-role key>
   # The preview R2 bucket, the same values as the Vercel Preview environment:
   R2_ACCOUNT_ID=…
   R2_ACCESS_KEY_ID=…
   R2_SECRET_ACCESS_KEY=…
   R2_BUCKET=…
   ```

   `.env.local` is gitignored. Never commit it, paste it or send it anywhere.
3. Run `pnpm qa:accounts`. The first run prints one SQL line for `qa-admin`'s admin role.
   Run it once in Supabase → **SQL Editor** on the preview project. `qa-admin` is never
   recreated, so you only do this once.

## Personas

`pnpm qa:accounts` prepares the five shared QA personas. Use `pnpm qa:reset qa-invitee`
to prepare the separate invitation acceptance account.

| Persona | Email | Starting state |
|---|---|---|
| `qa-admin` | qa-admin@shotviva.com | `role = admin` (Owner step above), 6 free + 200 paid credits |
| `qa-creator` | qa-creator@shotviva.com | 6 free + 100 paid credits, one succeeded private work (placeholder image) on Photos |
| `qa-fresh` | qa-fresh@shotviva.com | Deleted and recreated every run: no credits, no works, no ledger. Its first sign-in grants the 6 signup credits through the real first-sign-in path |
| `qa-max` | qa-max@shotviva.com | Max tier from a `max_yearly` purchase (paid until a year after the first run), 6 free + 3360 paid credits |
| `qa-free` | qa-free@shotviva.com | Signup credits only: 6 free, 0 paid, no tier |
| `qa-invitee` | qa-invitee@shotviva.com | Created by its own reset with a fixed test signup IP, the configured signup grant in the free pool and no prior payment or invitation |

For invitation acceptance, reset `qa-invitee` before the first purchase and use
`pnpm qa:login qa-invitee`. Resetting recreates this test identity, records `192.0.2.94`
as its signup IP, and calls the standard signup grant with `site.billing.freeCredits`.
Use a different QA persona as the inviter. Keep the same invitee for both purchases to
check that the second payment gives no repeat reward.

How it gets there:

- Users come from the Supabase Admin API: email already confirmed, no password. No email is
  sent.
- Credits and tier change only through the existing SQL functions, so every change is in the
  credit ledger:
  - `grant_credits`, with the app's own signup key, so a later first sign-in grants nothing twice.
  - `apply_purchase('max_yearly')`, with the fixed event id `qa-max:max_yearly`.
  - `admin_adjust_credits` to reset a pool back to its target. Its key is derived from the
    persona's latest ledger row, so it only writes when the balance actually moved.
- `qa-creator`'s work goes through `reserve_credits` and then `confirm_job`, with a job id
  derived from the user id. The placeholder PNG goes to `outputs/<user id>/<job id>.png` in R2.
- Banned personas are unbanned with `admin_unban_user`.
- A persona that drifted past a reset is deleted and recreated, R2 files first, the same way
  account deletion works. That means `qa-free` after it bought anything, or `qa-max` when it's
  no longer on Max.
- The `qa-max` purchase appears in the preview admin orders and revenue as one `max_yearly` order.

The script ends with a table of each persona's role, tier, balances, works, ledger rows and
what this run did (`created`, `recreated`, `reset` or `unchanged`).

## Resetting one persona (T88)

```bash
pnpm qa:reset qa-free
```

This puts the named persona back into its starting state from the table above. It takes exactly one persona;
anything else (`all`, a typo, two names) is refused before it reads `.env.local`. It ends with the
same state table, with one row.

- Use it when your own persona is in the wrong state mid-validation (it bought something, ran
  out of credits, got banned).
- `qa:accounts` resets **all five**. While other validation lanes are running, that pulls the
  state out from under their windows (`qa-fresh` is deleted and recreated, balances jump back),
  so it is only for setting up before anyone starts.

## Signing in

```bash
pnpm qa:login qa-max
```

```bash
pnpm qa:login qa-admin --next /admin
```

This prints `<site>/auth/confirm?token_hash=…&type=magiclink&next=…`. The link goes through the
site's normal email-link landing. Opening it signs that browser window in as the persona and
lands on `next` (default `/account`).

- **The link is a credential.** Open it once, in that persona's own window. Never paste it into
  a PR, an issue or a chat.
- Each run makes a new link. A link works once, and it expires with the project's email-link
  lifetime (1 hour by default).
- **One window per persona.** A new link replaces the persona's previous one (Supabase keeps one
  sign-in token per account), so generating a link for a persona another window is still
  signing in with makes that window's link fail as `link_expired`. A reload or retried
  navigation of a used link fails the same way; generate a fresh one instead.
- `QA_SITE_URL` points the link at another preview deployment (`https://….vercel.app`) or a
  local `next dev`. The production domain is refused.
- **Several accounts in one browser.** Cookies are per host, so each test-site host keeps its own
  sign-in. Besides the branch URL, the test site answers on `https://shotviva-qa-admin.vercel.app`
  and `https://shotviva-qa-user.vercel.app` (listed in the Vercel Preview variable
  `PREVIEW_EXTRA_HOSTS`; an unlisted host lands on the branch URL after sign-in and fails
  same-origin checks). Example:
  `QA_SITE_URL=https://shotviva-qa-admin.vercel.app pnpm qa:login qa-admin --next /admin/templates`.

## For Codex (paste-ready)

> From the repo root, which has the preview `.env.local`. For each browser window, run
> `pnpm qa:login <persona>` (add `--next /path` to land on a specific page) and open the
> printed link in that window only. Personas: `qa-admin`, `qa-creator`, `qa-fresh`, `qa-max`,
> `qa-free`, `qa-invitee`. Never paste the links anywhere; each works once. The window must already be through
> Vercel's deployment protection.
>
> If your persona is not in its starting state, run `pnpm qa:reset <persona>` for **your own
> lane's persona only**, then sign in again. Never run `pnpm qa:accounts` while validating in
> parallel: it resets all five personas, including the ones other lanes are using. Only run it
> when you are the only one validating, before you start.

## Phone sign-in persona (T63, Chinese pages)

Phone accounts are not made by `pnpm qa:accounts`. They come from Supabase **test phone numbers**:
a number with a fixed code, for which Supabase sends no SMS and does not call the Send SMS hook.

- Owner, once, on the **preview** project only: Supabase → Authentication → Sign In / Providers →
  Phone → *Test phone numbers and OTPs*. Add two or three numbers in the 140 range (IoT data-only
  numbers that cannot receive SMS, so never a person's), e.g. `8614000000101=<6 digits>`, with a
  far expiry date. Keep the numbers and codes in the team's password manager, not in this repo.
- In the browser: open `/zh/login` (or `/zh/signup`), 手机号 tab, enter the number, tick the
  consent box, 获取验证码, then type the fixed code. A new number becomes a new account with the
  signup gift (same-IP rule as always); the same number again signs that account in.
- Our own limits still count test numbers (one per minute, five a day per number, twenty a day per
  network), so the limit checks can be validated without real SMS. To start a number fresh as a
  new account, delete it from its own account page (注销账号); the limit rows expire after a day.
- Real SMS is never sent from the preview: the preview's `SMS_PROVIDER` is `fake`.

## Guards

- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are read from `.env.local` only.
  A different value exported in the shell is refused.
- The project ref must be `pnzkiqvktkzznfbyhphe`. `QA_EXTRA_SUPABASE_REFS` (comma separated)
  can add others, for example `local` for a `supabase start` stack. Refs listed in
  `PRODUCTION_REFS` (`target.ts`) are always refused, and so is anything that isn't a
  `<ref>.supabase.co` URL.
- Reset and login for `qa-invitee` always require the named preview project, even if extra refs are configured.
- A JWT service key must carry `role: service_role` and the same `ref` as the URL.
- The service key is never printed.

## Local run (developers)

Point `.env.local` at a local stack with `QA_EXTRA_SUPABASE_REFS=local` and
`QA_SITE_URL=http://localhost:3000`. Without R2 settings on a local stack, the placeholder
upload is skipped and the run says so.

## Renewals on a Stripe test clock

The test site (Vercel Preview, Stripe test key, not the production domain) checks a QA
persona's **card subscription** out as a Stripe customer on its own test clock, frozen at the
time of checkout (`core/billing/stripe/qa-test-clock.ts`). One-time payments, and every
account that is not a QA persona, check out exactly as before. Production can never turn it
on: the code checks `VERCEL_ENV === 'preview'`, an `sk_test_` key and the domain itself, with
no setting to override them.

```bash
pnpm qa:clock list
```

lists the QA clocks with their subscriptions and period ends.

```bash
pnpm qa:clock advance clock_…
```

moves the clock one hour past the latest period end. Stripe then bills the next period: a
real `subscription_cycle` invoice and its `invoice.paid` webhook to the test site.

```bash
pnpm qa:clock delete clock_…
```

deletes the clock with its customer and subscriptions. The script only runs with an `sk_test_`
key and only touches clocks named `shotviva-qa …`.
