# Supabase Auth setup — I-MODE Plus Service & Maintenance V6.8 Service focus

How to move the login from the offline UAT accounts to real server-side authentication.

Nothing here runs automatically. You run each file yourself, on a project you control.

---

## Production cut-over (do not use the UAT policy)

`04-anon-uat.sql` is for the disposable UAT project only. It gives the public anon key
full read/write access and must never be applied to production.

Use this order for the production project:

1. Turn on and verify database backups.
2. Create the production Supabase project and run the schema/table files it needs.
3. Create the real staff users in Supabase Auth and verify every user has an active row
   in `public.profiles` with the correct role and technician link.
4. Complete the anonymous Customer Portal prerequisites listed at the top of
   `10-production-rls.sql`, then review and run that file. Do **not** run it against the
   current local-UAT login: local staff would immediately lose cloud access.
5. In the application settings, set `settings.authConfig.provider` to `supabase` and keep
   `allowLocalFallback` disabled.

`10-production-rls.sql` is deliberately a prepared file: Codex/Claude must not execute it
for you. Take a fresh backup immediately before the cut-over and test with a non-admin
staff account before importing real customer records.

---

## What changes, and what does not

| | Before | After |
|---|---|---|
| Where passwords are checked | in the browser | on Supabase (bcrypt) |
| Who can read the tables | anyone holding the anon key | only a signed-in user with an active profile |
| What a Customer can see | everything the app synced | only their own company's rows |
| Password reset | not possible | email link |
| Offline | fully offline | cached session keeps working, first sign-in needs network |

The application code does not change. `auth/auth-supabase.js` is already in the build and
switches on by itself as soon as a Supabase URL and anon key are configured.

---

## Order of work

### 1. Create the project (skip if you already have one)

Supabase → New project. Keep the **Project URL** and the **anon / publishable key**.
The anon key is meant to be public; it ships inside every browser. It is not a secret.

**Never put the `service_role` key in this application.** It bypasses every policy below.

### 2. Run the SQL, in order

Supabase → SQL Editor → paste and run:

0. `00-tables.sql` — the 11 tables the app syncs with. **Skip only if they already exist.**
   `initCloud()` tests the connection by querying `service_cases`, so on an empty project
   the app reports "เชื่อม Cloud ไม่สำเร็จ" until this has run.
1. `01-schema.sql` — adds `profiles`, `auth_audit` and the helper functions.
   Adds objects only; existing tables are untouched.
2. `02-rls.sql` — turns on Row Level Security and writes the policies.
   **Read the warning at the top first.** This is the breaking step.
3. `03-users.sql` — links accounts to app records, and the checks that prove it worked.

All four are safe to run again.

**Watch out for silent sync failures.** `cloudUpsert()` catches its own errors and only
writes to the browser console:

```js
async function cloudUpsert(table,obj){ ... catch(e){ console.warn(e) } }
```

A missing or misspelled column therefore does not show an error in the UI — the row just
never arrives. After connecting, open DevTools → Console, save one record in each module,
and confirm there are no `console.warn` messages from the upsert.

### 3. Create the users

The four UAT accounts, and what each is linked to:

| Username | Role | Linked to |
|---|---|---|
| `admin_test` | Admin / Coordinator | — |
| `technician_test1` | Technician | `technicians.id = 'T001'` |
| `technician_test2` | Technician | `technicians.id = 'T002'` |
| `customer_test1` | Customer | `customers.id = 'CUST-0001'` |

`03-users.sql` has both ways to create them:

- **Method A** — Authentication → Users → **Add user**, four times, pasting the ready-made
  User Metadata block for each. Always works.
- **Method B** — one SQL block that creates all four at once. Faster, but it writes into
  `auth.users` directly, which Supabase does not officially support. If it errors, delete
  any half-created user and use Method A.

**Tick "Auto Confirm User".** Without it the sign-in fails with *"Email not confirmed"*,
and `@imode.local` can never receive the confirmation mail. Check number 3 in
`03-users.sql` finds accounts that are missing this.

`role` must be one of the role names in the app's **Settings → Roles**
(`Admin / Coordinator`, `Technician`, `Sales`, `Service Manager`) or `Customer`.

`technician_id` must match `technicians.id` in the app (`T001`, `T002`, …).
`customer_id` must match `customers.id` (`CUST-0001`, …).
Get them wrong and the account signs in but is linked to nothing: Field Service will not
find the technician's jobs, and a customer will see an empty portal. Both fail quietly,
which is why `03-users.sql` ends with checks for exactly this.

**Email addresses.** The app turns a username into `<username>@imode.local` when there is
no `@`, so `admin_test` signs in as `admin_test@imode.local`. That works, but a fake domain
cannot receive a password-reset link. Use real addresses for anyone who should be able to
reset their own password.

**Passwords are not written in this repository.** Choose a strong one per account when you
create it (never the username) and keep it out of the code.

### 4. Point the application at the project

In the app: **Settings → ฐานข้อมูล Cloud** → paste the Project URL and the anon key → save.

That is the only step. The login switches from `local` to `supabase` on the next load,
and the offline UAT accounts stop working — deliberately: leaving them enabled beside a
server check is a way around it.

To keep them for testing, set `settings.authConfig.allowLocalFallback = true`. Do not do
this on a production project.

### 5. Verify before trusting it

Run the queries at the bottom of `03-users.sql`, then check by hand:

- [ ] A technician signs in and Field Service opens **their own** queue.
- [ ] A customer signs in and sees only their own company's machines.
- [ ] A customer cannot read `technicians`, `system_settings`, `quotations` or
      `notifications` — try it in the SQL Editor with their token, or in the browser
      console with the anon key.
- [ ] **The anon key alone reads nothing.** In a private window, before signing in:
      ```js
      const c = supabase.createClient(URL, ANON_KEY);
      await c.from('customers').select('*');   // must return an empty array, not rows
      ```
      If rows come back, RLS is not on and the login is decoration. Stop and fix it.
- [ ] Disabling an account (`update profiles set is_active = false`) blocks the next
      sign-in.

---

## Things to decide before production

**Sync without a sign-in stops working.** Today the app pulls from Supabase at start-up
with no login. After `02-rls.sql` an unauthenticated device gets nothing and falls back to
its localStorage. A brand-new device shows an empty app until someone signs in.

**A revoked account keeps working offline for a while.** A device that cannot reach the
server keeps its cached session through the offline grace period — 7 days by default,
`settings.authConfig.offlineGraceDays`. Shorten it if that is too long for you. The
trade-off is real: shorter grace means technicians in bad signal are locked out sooner.

**A technician's first sign-in on a device needs network.** There is no offline
first-login, by design; a local password check would be exactly the bypass this setup
removes.

**Customer QR before login.** A visitor who scans a machine QR reaches the Customer Home
page and must sign in. On a device that has never synced, there is no machine data to
show. Decide whether customers get accounts, or whether the portal should stay open.

**The audit trail is append-only through the API but not immutable.** Anyone with the
`service_role` key or database access can edit `auth_audit`. Treat it as an operational
record, not as evidence.

---

## Session settings

Defaults live in `auth/auth-core.js` and can be overridden in `settings.authConfig`:

| Setting | Default | Meaning |
|---|---|---|
| `sessionHours` | 12 | absolute lifetime from sign-in |
| `idleMinutes` | 240 | signed out after this much inactivity |
| `offlineGraceDays` | 7 | how long an offline device works past expiry |
| `maxAttempts` | 5 | failed sign-ins before a temporary lock |
| `lockoutMinutes` | 15 | how long that lock lasts |
| `usernameDomain` | `imode.local` | appended to a username with no `@` |
| `provider` | auto | force `local` or `supabase` |
| `allowLocalFallback` | false | keep UAT accounts alive next to Supabase |
| `passwordMinLength` | 6 | minimum length when changing a password |
| `passwordRequireLetterAndDigit` | false | require both letters and digits |
| `passwordRejectUsername` | false | forbid a password equal to the username |

The password rules are **deliberately relaxed for UAT** and apply only when *changing* a
password — never to signing in, so existing accounts keep working
regardless. Tighten them for production without touching any code:

```js
settings.authConfig = {
  passwordMinLength: 8,
  passwordRequireLetterAndDigit: true,
  passwordRejectUsername: true
};
```

Supabase enforces its own server-side minimum length (6 by default, raise it under
Authentication → Policies) on top of whatever is set here.

The lockout is enforced in the browser, so it only slows a person down at the keyboard.
Supabase applies its own rate limiting on the server, and that is the one that counts.

---

## Files

| File | Purpose |
|---|---|
| `00-tables.sql` | the 11 data tables the app syncs with (skip if they exist) |
| `01-schema.sql` | `profiles`, `auth_audit`, helper functions |
| `02-rls.sql` | Row Level Security — the part that actually secures the data |
| `03-users.sql` | link accounts to app records, plus verification queries |
| `../auth/auth-core.js` | session, expiry, idle timeout, lockout, audit, offline grace |
| `../auth/auth-local.js` | offline / UAT provider |
| `../auth/auth-supabase.js` | Supabase Auth provider |
| `../auth/auth-integration.js` | wires it into the application |
