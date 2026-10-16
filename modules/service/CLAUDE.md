# I-MODE Plus Service & Maintenance — Claude Code Project Memory

## Role

You are the coding agent for an existing project:

I-MODE Plus Service & Maintenance
Current release: Version 1.0  (see ## Version for the history)

Your job is to safely maintain and incrementally improve the existing system.

The current code and behavior are the source of truth.

Investigate before answering.

Never speculate about code that you have not inspected.

When the user refers to a function, page, module, bug, or UI element:
read/search the actual current implementation before making claims.

---

## Critical Working Rule

Do not start by refactoring.

Use this sequence:

INSPECT
→ TRACE
→ PLAN
→ EDIT
→ VALIDATE
→ REGRESSION CHECK
→ REPORT

Prefer the minimum implementation needed for the requested task.

Do not create abstractions, helpers, files, or frameworks for hypothetical future requirements.

---

## Project Scope

This is a Service & Maintenance management system.

Main business workflow:

Customer / LINE OA / Phone / Email
→ Customer Master
→ Machine Master
→ Service Case
→ Quotation if needed
→ Technician Assignment
→ Calendar
→ Field Service
→ Service Report
→ QC
→ Warranty / Machine Documents
→ Close Case
→ Dashboard / Reports

CRM and Sales CRM are explicitly out of scope.

Never reintroduce CRM unless the user explicitly changes project scope.

---

## Application Architecture

Current main application entrypoint:

`index.html` — **markup only since 2026-09-07.** All CSS and JavaScript now live in
`css/NN-*.css` and `js/NN-*.js`, loaded in numeric order by `<link>` / `<script src>` tags
in exactly the position their inline block used to occupy. The number prefix **is** the
load order; never reorder or renumber them.

One page is no longer in `index.html` at all: the **Customer Portal** markup lives in
`pages/customer-portal.html` and is inserted into `<main>` by `pages/pages.js`, a
`<script src>` sitting where the `<section>` used to be. `pages/` is deliberately outside
the `js/` numbering — it runs during parsing, not in the tail block. **The app must
therefore be opened over http** (Live Server, GitHub Pages); a plain `file://`
double-click cannot read the fragment and the portal falls back to a notice. Headless
tests keep working because `--allow-file-access-from-files` permits the read.

Expect:

- one script per historical patch layer (`js/03-app-core.js` is the original application;
  `js/04`… are the patches that override it, newest last)
- multiple IIFEs
- functions assigned to `window`
- top-level `let` / `const` that are **lexical globals**, shared across script files but
  **not present on `window`** (`settings`, `cases`, `machines`, `currentUser`,
  `PAGE_PERMISSION`, `MODULES`…) — read them by bare identifier
- duplicated definitions
- later patches overriding earlier implementations
- localStorage persistence
- optional Supabase synchronization

Never assume the first matching function is active.

Search the full workspace and identify the effective current implementation — with the
split, `grep -n "function name" js/*.js` shows every definition and the file order tells
you which one wins.

---

## Version

Keep:

**Version 1.0**  (no suffix, no "Beta")

Seven places carry it, and all seven must move together:

| Where | String |
|---|---|
| `index.html` `<title>` | `I-MODE Plus Service & Maintenance · Version 1.0` |
| `index.html` sidebar block | `Version 1.0` (the second line was removed) |
| `index.html` topbar brand | `Version 1.0` |
| `js/06-v68ModulesScript.js` (×2) | rewrites the sidebar block on **every render** (sets the text, removes the sub-line) |
| `service-case-detail.html` `<title>` and brand | its own copy — the page does not share `index.html`'s |

**Editing the markup alone silently reverts**, because `js/06` rewrites the sidebar version
block on every render. That trap has been hit twice.

History, because older entries in this file say otherwise: `V6.8 Service focus` until
2026-09-09 (part 16) → `Beta Service focus` → `Beta 1.0 Service focus full system` on
2026-09-10 → **`Version 1.0`** on 2026-09-24 (Beta and the suffix dropped for the move to the production server), each at the owner's request. An entry before all of them said "Service UAT",
which was wrong. **This section is the current one.** The change logs below record what
happened on a given day; they are not standing instructions.

Do not bump or rename the release — and in particular do not "restore" an older string —
unless explicitly requested.

---

## Design Language

Preserve:

- professional white UI
- I-MODE blue
- orange primary/action accents
- mild dimensional button effect
- V5.17-like header direction
- V6.7.1-like sidebar behavior
- responsive desktop/tablet/mobile
- TH/EN
- font scaling

Do not redesign unrelated pages.

Do not redesign Settings responsive layout unless explicitly requested.

---

## Modules

Current functional areas include:

Dashboard
Customers
Machines
Service Cases
Quotation
Onsite / Work Site Pricing
Service Maintenance
Calendar
Field Service
Machine QC
Spare Parts
Purchase Orders
Petty Cash
Warranty
Machine Documents
Notifications
Reports
Settings
Customer Portal / QR / LINE OA

Preserve existing modules unless explicitly instructed otherwise.

---

## Technician Role

Normal Technician experience should focus on approximately:

1. My Work / Technician Home
2. Calendar
3. Field Service
4. Machine QC
5. Parts for Job
6. Machine Information / Documents
7. My Expenses
8. My Reports

Technicians generally should not manage:

Quotation Approval
Pricing Configuration
Purchase Orders
Department Petty Cash
User Management
Settings
Cloud/Supabase
Company-level Reports

Field Service is the technician's main workspace.

---

## Field Service

Expected workflow:

Assigned
→ Appointment
→ Traveling
→ Arrived
→ GPS Check-in
→ Inspection
→ PM / Maintenance / Service
→ Repair
→ Waiting Parts if needed
→ Testing
→ Customer Acceptance
→ Signatures
→ Service Report
→ Finish

Existing statuses:

กำลังเดินทาง
ถึงหน้างาน
เริ่มตรวจเช็ก
กำลัง PM / Maintenance
กำลังซ่อม Service
รออะไหล่
ทดสอบเครื่อง
รอลูกค้าตรวจรับ
จบงาน

Existing capabilities include:

- GPS Check-in
- status timeline
- media evidence
- Before / After photos
- video
- PM/Service checklist
- diagnosis
- work performed
- recommendation
- replaced parts
- customer signature
- technician signature
- next PM date
- Service Report

Priority future improvements:

P1:
- Timesheet / Work Time Tracking
- Parts Request / Issue / Return
- Closing Gate validation

Prefer extending Field Service rather than creating redundant modules.

---

## Service Case

Default statuses:

เคสใหม่
→ มอบหมายแล้ว
→ นัดหมายแล้ว
→ กำลังดำเนินการ
→ รออะไหล่
→ รอส่งงาน
→ เสร็จสิ้น
→ ปิดเคส

However:

`รออะไหล่` is conditional.

Do not implement a workflow that forces all cases through that state.

Support logical branches.

---

## Machine Master

Machine Master links to:

Customer
Service Case
Quotation
QC
Warranty
Documents
Spare Parts
Service History
Customer Portal / QR

Machine pagination must be preserved:

10 / 25 / 50 / 100 / All

Preserve:

Search
Service Filter
Warranty Filter
Size Filter
Previous
Next
Page numbers

Do not modify Serial, Customer, Warranty, Service Status, or other machine identity fields merely to fit UI behavior.

---

## Machine Image Logic

Priority:

actual `m.photo`
→ exact-model reference
→ machine-family reference
→ No Image

Reference images must not overwrite persisted `m.photo`.

Use `object-fit: contain` for product reference images.

---

## Machine QC

Types:

Incoming Inspection
Pre-Delivery QC
Post-Service QC
Installation Acceptance
PM Verification

Statuses:

Draft
In Progress
Pass
Conditional
Fail

Checklist:

Pending
Pass
Fail
N/A

QC is linked:

Customer
→ Machine
→ Service Case
→ QC

Keep the Thai two-page QC document.

Page 1:
General information / Checklist / Result / Signatures

Page 2:
Evidence / damage / missing equipment / Findings / Corrective Action / photos

Videos do not need to print.

Historical scope bug to verify:

`window.qcDocHTML()` previously called a `qcTypeThai()` defined in another IIFE.

Do not patch this blindly.

First inspect whether the current active implementation still has this scope error.

If it does:
apply a minimal scope fix.

Do not redesign QC.

---

## Quotation

Service Quotation may use:

Customer
Service Case
Machine
Size
Service Type
Travel
Google Maps
Urgency
Warranty
Parts
Labor
Discount
VAT

No Sales CRM.

Onsite pricing must not silently overwrite an existing quotation.

Require explicit user action.

---

## Onsite Pricing

Service Levels:

S = 500 THB
M = 1,000 THB
L = 1,500 THB

Travel:

0–15 = 250
16–30 = 400
31–50 = 600
51–80 = 900
81–120 = 1,300
121–180 = 1,900
>180 = 10 THB/km or manual

Formula:

Service Level
+ Travel
+ Spare Parts
+ Actual Cost

---

## Spare Parts

Current concepts:

Part No.
Name
Supplier
Unit
Current Qty
Min
Max
Reorder Point
Lead Time
Location
Machine mapping

PO states:

รออนุมัติ
สั่งซื้อแล้ว
รับเข้าแล้ว
ยกเลิก

Future Technician Parts flow:

Request
→ Reserve
→ Issue
→ Use
→ Return
→ Actual Stock Movement
→ Service Report

Do not expose unrestricted purchasing features to a normal Technician.

---

## Petty Cash

Statuses:

รอเคลียร์
เคลียร์แล้ว
ยกเลิก

Technician UX should eventually use:

My Expenses

linked to Service Case.

---

## Warranty

Warranty connects:

Customer
Machine
Serial
Service history

Preserve warranty certificate/document functionality.

---

## Machine Documents

Categories include:

Operating Manual
Technical Datasheet
Electrical Diagram
Mechanical Drawing
PM Checklist
SOP / Work Instruction
Software / Firmware
Calibration / Certificate
Spare Parts List
Training Material

---

## Customer Portal

Customer Portal / QR / LINE OA must remain separate from the internal application UI.

Customer actions may include:

- report problem
- request quotation
- warranty check
- warranty quotation
- service history
- machine documents
- contact Service

Preserve existing portal mode behavior.

---

## Responsive Requirements

Desktop:
normal sidebar/topbar/table workflow.

Mobile:
drawer
compact topbar
bottom navigation
mobile cards
no horizontal topbar overflow

Do not regress Calendar mobile behavior.

Do not redesign Settings mobile layout.

---

## Assets

Use:

`./assets/Iconservice.png`
for favicon

`./assets/imode-ui-logo-v532.png`
for internal UI/sidebar

`./assets/imode-document-logo.webp`
for documents / QR / QC

Never swap these roles.

GitHub Pages is case-sensitive.

---

## localStorage Safety

Preserve these keys:

`imode_test_v532_cases`
`imode_v5_tech`
`imode_test_v532_customers`
`imode_test_v532_machines`
`imode_test_v532_notifications`
`imode_test_v532_quotes`
`imode_v5_settings`
`imode_v5_cloud`
`imode_v5_current_user`
`imode_test_v532_warranties`
`imode_test_v532_machine_documents`
`imode_test_v532_line_requests`
`imode_test_v532_service_reports`
`imode_v66_qc_records`
`imode_v67_petty_cash`
`imode_v67_spare_parts`
`imode_v67_purchase_orders`

Added by the login system (2026-09-07), same rules apply:

`imode_v69_session`
`imode_v69_auth_audit`
`imode_v69_auth_lock`
`imode_v69_local_pw`
`imode_v69_sb_auth`

Added later, same rules apply:

`imode_v69_cloud_optout`   set by ตั้งค่าระบบ → ใช้ข้อมูลในเครื่อง; while it is set, js/23
                           will not auto-connect this device to Supabase
`imode_v69_home_usage`     per-account tally that orders the Home quick board
`imode_v70_trash_blob`     recycle-bin payloads too large to travel inside `settings`
`imode_v70_pending_route`  **sessionStorage** — the page the visitor was heading for, kept
                           across the login door because js/28 spends the URL params first.
                           (`imode_v70_tab_authed` existed for one build on 2026-09-11 and was
                           removed again when the door became first-visit-only.)
`imode_v70_case_responded` the ตอบกลับแล้ว stamps recorded on this device, re-applied after a sync
                           that did not carry them, and the only way service-case-detail.html
                           (which never writes) can record one
`imode_v70_field_last_job` `{technicianId: caseId}` — the job each technician had open on หน้างาน
                           last, so opening the module again reopens it instead of re-picking by
                           appointment. Per device on purpose; losing it only changes which job
                           หน้างาน opens with

Clearing `imode_v69_session` signs the user out; clearing `imode_v69_local_pw` restores
the built-in UAT passwords; clearing `imode_v70_trash_blob` makes the large entries in the
bin unrecoverable but leaves their rows visible. None of them destroys business data.

**Two things now live inside `settings` rather than in a key of their own**, because they
have to reach every device: the login accounts (`settings.uatAccounts`,
`settings.uatAccountEdits`) and the recycle bin (`settings.trash`). `mergeSettings()`
spreads the saved object wholesale, so unknown top-level keys survive it — checked, because
a whitelist there is exactly what silently ate four permissions in an earlier session.

Never run:

`localStorage.clear()`

Do not perform destructive migrations unless explicitly requested.

---

## Supabase Safety

Do not change:

- project URL
- Anon / Publishable key
- table names
- cloud configuration

without explicit request.

Never add service-role credentials to frontend code.

Existing cloud areas can include:

service_cases
technicians
customers
machines
notifications
system_settings
quotations
machine_warranties
machine_documents
line_customer_requests
service_reports

Added 2026-09-10 by `supabase/05-v70-operational-tables.sql`, already run:

qc_records
petty_cash
spare_parts
purchase_orders

Those four are **`{id, data jsonb, updated_at}` with the whole record in `data`**, unlike
every table above them. That is deliberate — see part 17 §3 — so do not "normalise" them
into columns without reading it first.

Added 2026-09-11 by `supabase/06-v70-case-media.sql` (run, verified 2026-09-11):

`service_cases.media jsonb` and `line_customer_requests.media jsonb`, holding the photos and
clips a customer attaches to แจ้งปัญหา. `js/42` probes for the column once per session and
degrades without it. Later additions (`07` responded_at, `12` customers.contacts, `13`
notification_reads) are folded into `production/database/01-schema.sql`.

`notifications` is downloaded but never uploaded; there is no `cloudUpsertNotification`.
Addressed notices are derived from the case instead.

---

## Git / Deployment

Deployment: GitHub Pages serves the test site (repo root) and the production build (`app/`). The company VPS is next — see CURRENT STATE.

Project/repository is associated with:

`ImodeService`

Use relative asset paths.

Be careful with filename casing.

Do not change Pages configuration without explicit instruction.

For meaningful changes:

prefer a feature branch unless the user's workflow explicitly says otherwise.

Never auto-merge a PR unless requested.

---

## Editing Policy

For each requested task:

### Inspect

Read the relevant current files.

Search relevant function names and IDs.

Search for duplicates.

Understand persistence and side effects.

### Plan

State the smallest safe implementation.

### Edit

Modify only necessary code.

Avoid unrelated cleanup.

### Validate

Check inline JavaScript syntax.

Run appropriate tests.

Inspect runtime scope.

### Regression

Check affected desktop and mobile behavior.

Check persistence.

Check asset paths.

### Report

Summarize:

- files changed
- active functions changed
- behavior changed
- validation run
- remaining risk

---

## JavaScript Validation

The application's JavaScript lives in `js/*.js` (plus `auth/*.js`).

After JS changes, syntax-check the files you touched with:

`node --check js/<file>.js`

node is installed (v24). Under a folder whose package.json has "type":"module", use
`new vm.Script()` instead — `node --check` would parse the file as an ES module.

Also review:

ReferenceError
IIFE scope
duplicate const/let
undefined global
function override order

Do not treat syntax success as proof of runtime correctness.

---

## Do Not Do These

Do not:

- rewrite the application
- migrate frameworks
- clean unrelated legacy code
- rename everything
- reset user data
- change storage keys
- change Supabase settings
- change database schema without approval
- remove modules
- add CRM
- change Version
- redesign unrelated pages
- create unnecessary helper scripts
- hard-code secrets

---

## New Session Startup

At the start of a new project session:

1. Read this CLAUDE.md.
2. Inspect the current repository.
3. Inspect the active `index.html`.
4. Do not edit yet unless the user already requested a specific change.
5. Ground all statements in the actual current code.

If asked only to understand the project, report:

- project structure
- architecture
- modules
- persistence
- active JS sections
- overridden/duplicate functions
- Service workflow
- Technician workflow
- risks / technical debt

Then wait.

If the user gives a specific task, investigate first and then proceed with the smallest safe change.

---

## History lives in `docs/CHANGELOG.md`

Every session log (part 1 → part 40, 2026-09-05 → 2026-10-06) was moved, unchanged, to
[docs/CHANGELOG.md](docs/CHANGELOG.md) on 2026-10-08 so this file stays small — every session
and every subagent loads CLAUDE.md in full. When an entry here says "part N", look it up there
(`grep -n "part N)" docs/CHANGELOG.md`). **New session logs go at the end of
`docs/CHANGELOG.md`, not here.** Only update this file when a rule or the current state changes.

---

## Hard-won rules (each one has broken something before — details in the changelog)

**Scope and globals**
- Top-level `let`/`const` are lexical globals and **never on `window`**: `settings cases machines
  customers technicians currentUser notifications quotations warranties machineDocuments
  serviceReports supa cloudSettings qcRecords lineRequests fmt fmtDay`. Read them by bare name.
  `window.esc` IS exported (part 35). A top-level `function` declaration IS on `window`.
- js/04's `pettyCashEntries / sparePartsStock / purchaseOrders` are inside an IIFE — use
  `window.imodeV67Data.get()/set()`.
- A wrapper that calls a function's CLOSURE (js/16 `renderMyWork`, js/26 `decorate`, js/09
  `allAccounts`/`accountToUser`) is not reached by wrapping the exported name — wrap the caller or
  observe the DOM.
- `service-case-detail.html` is a separate document, an IIFE, stored CRLF, loads nothing from
  `js/` except js/51 and js/121 — it carries its own copies (todayISO, esc, A4 fit, team scope).

**Sync and data**
- `syncCloud()` **replaces arrays wholesale** (`cases`, `lineRequests`, `settings`, …). Anything
  written before `initCloud()` finishes, or not acknowledged by the cloud, is lost unless re-applied
  after the sync. A version flag stored inside `settings` is replaced together with what it guards.
- `cloudUpsertCase / Quotation / Customer / LineRequest` send an **explicit column list**. A new
  field on the object never reaches Supabase unless the payload names it — use an existing jsonb
  column (`field_status_log`) or inject at `cloudUpsert()` like js/42/js/114.
- `settings` is ONE jsonb row every device downloads on every sync and pushes whole. Never put
  images or growing logs in it. Keys keyed by record id must be in js/90 `MAP_KEYS` and its prune
  lists. Roles are protected by `settings.permStamp` (js/90).
- A record comes back only if this device holds it, the cloud never had it, and it is not in the
  bin (js/71, js/110). Never auto-delete technician records or cases (part 36 §1).
- A read returning 0 rows under RLS is not proof the table is empty.
- `c.assignee` is the lead, or a comma list of the crew (js/38). Compare with `caseHasTech()` /
  `imodeIsAssignedTo`, never `===`.
- Dates: `toISOString()` is UTC (Thailand is +7) — use `localISO()/todayISO()`.
- A blank canvas still yields a valid PNG — count ink pixels before treating a signature as present.
- Permission keys pushed into `PERMISSION_CATALOG` must load **before js/20**; later files reuse
  existing keys.

**DOM and CSS**
- `#modalPanel` stops click propagation (js/05) — listeners for popup contents go on `#modalBody`.
- A closed modal leaves its markup in the DOM; a duplicated id makes the id-global an HTMLCollection.
- ≈25 modals bind `onsubmit` on `setTimeout(…,20)`; never call `openModal()` twice in one tick.
- `[hidden]` vs author `display`: css/23 ends with `[hidden]{display:none!important}` — no more
  one-offs. `css/21` and `css/23` must stay the last two `<link>`s; runtime `<style>` instead.
- Elements read as id globals by js/03 (`#fieldQueue`, `#portalLineIdentity`, `#fStatus`,
  `#checklistEditor`, `#fServiceType`, `#purchaseOrderTable`) are hidden, never removed.
- Several functions (`applyV68Labels`, js/06's sidebar version block) rewrite markup on every
  render — editing the HTML alone silently reverts.

**Security**
- The repo is **public**. Never write passwords, hashes, service keys, or server credentials into
  any tracked file, including this one and `docs/CHANGELOG.md`.
- `04-anon-uat.sql` on the old test DB let anyone read/write; production
  (`cwrkquzuuyhfhesozqnb`) runs `production/database/02-security.sql` (RLS, `portal_*` RPCs).

**Testing harness (headless Chrome over CDP, scripts in the session scratchpad only)**
- `Emulation.setDeviceMetricsOverride` for widths (`--window-size` clamps to ~500px).
- Own `--remote-debugging-port` per run, `--disable-extensions`, pick `type=='page'` targets.
- Block Google Fonts and CDNs or the parser stalls; set `imode_v69_cloud_optout` AND clear
  `imode_v5_cloud` so no suite touches a real database.
- Auto-accept `Page.javascriptDialogOpening`; give every CDP call a timeout; log to a file.
- Real CDP mouse events for drag/press; measure animation with `getAnimations()`.
- Find controls by id / `data-action`, not by visible text; no `\b` around Thai.
- Always run the control: the suite must fail on the old code.
- Write large or Thai files with a file tool, not a bash heredoc (truncates, eats backslashes);
  write `.tmp` then move.
- Test accounts: `lead_technician` / `lead_rd` on the test site (passwords are not kept in this repository).

---

## Subagents

Seven project subagents live in `.claude/agents/` (overview: `.claude/AGENTS-GUIDE.md`):
`code-scout`, `validator` (Haiku) · `patch-builder`, `browser-tester`, `docs-writer` (Sonnet) ·
`deep-debugger`, `server-ops` (Opus). Small edits are done in the main session; each subagent
call reloads this file, so keep it short.

---

## ⚠ CURRENT STATE — 2026-10-08 (read first)

### Systems

| | |
|---|---|
| Live system | `https://imodeservice.github.io/ImodeService/app/` → Supabase **`cwrkquzuuyhfhesozqnb`** (free plan). The team uses it with real data. `app/` is a BUILD — never edit by hand. |
| Rebuild `/app/` | `node tools/production/build-web.js --config=tools/production/github.config.json --out=app --strict` |
| Old test site | repo root → dead project `ywlrlfudlxsallanoroq` (402 egress). Shares localStorage origin with `/app/`; retire after the move. |
| Server files | `production/` (separate private repo, gitignored here): `database/01-schema.sql`, `02-security.sql`, `seed/` (real data — never in this repo), `INSTALL.md`. |
| Build + tests | `tools/production/` (`npm install && npm test` in `tools/production/test`). |
| Backup tool | `tools/backup/backup-db.ps1` → `Data\backup\db\` — **never run yet**. |

### The VPS (decided; details in `production/INSTALL.md`, not here — public repo)

Hostatom Cloud SSD3, Ubuntu, 4 vCore / 8 GB / 80 GB. **The owner runs every server command
himself** — guides must be copy-paste, one step at a time, each with a check. Claude does not SSH.
DNS for `imode.co.th` is at Maildee; mail is Microsoft 365, the company website is on another host —
only add subdomain A records (planned `app.` staff, `service.` customer), never touch MX/root/www.

### To do, in order

1. **Server part 1** (`production/INSTALL.md`, written 2026-10-08): SSH, update, user `imode`,
   SSH key, disable password/root, ufw, unattended-upgrades + fail2ban. Waiting for the owner's
   results.
2. Owner adds DNS A records `app` / `service` → the VPS (not done yet).
3. **Part 2**: Docker + self-hosted Supabase (keeps realtime). **Part 3**: Caddy + HTTPS (needed for
   camera QR, GPS, service worker).
4. First real backup of `cwrkquzuuyhfhesozqnb`, nightly schedule, check the Supabase org egress quota.
5. **Part 4**: on the VPS run `01-schema.sql` + `02-security.sql`, then move data with a **dump of
   `cwrkquzuuyhfhesozqnb`** (not `seed/03-real-data.sql`, which is older than the team's data).
6. Fill the 4 `REPLACE_ME` in `tools/production/production.config.json`, `npm test`, build
   `production/web/`, upload, test on the real domains and a phone.
7. At the move: js/23 must force the new endpoint over a stale `imode_v5_cloud`; `sw.js` bypass must
   not match only `supabase.co`; separate test/production DBs; QRs already made point at
   `…/app/` — reprint or keep `/app/` redirecting for ever; do not switch GitHub Pages off.
8. Retire the old test site.

Can be done while waiting: photos/signatures to Storage (`docs/STORAGE-PLAN.md`), sync only changed
rows, technician-scoped sync (part 36), hide the "ผู้ใช้ทดสอบ" link on the `/app/` staff door.

Still open from earlier: role **Admin** must have งานของฉัน unticked once more (part 34 §4).
