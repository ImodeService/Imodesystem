# I-MODE Plus Service & Maintenance — Codex Project Instructions

## Token Efficiency Lesson — 2026-09-22

- The owner explicitly prioritizes conserving context so work can continue across many tasks.
- On 2026-09-22, a small quotation-signature change consumed far too much context and left only 6%. Treat this as a concrete failure to avoid: for small changes, inspect only exact ranges, cap tool output aggressively, skip optional investigation/UI automation when the owner will test, and report only the result.
- Use narrowly targeted searches and bounded output; do not dump large files or broad grep results.
- Read only the relevant ranges after locating active definitions.
- Keep commentary and final reports short and factual; avoid repeating completed work.
- Test the changed behavior directly, but use the smallest focused harness and clean it up once.
- Stop expanding investigation when the requested behavior is verified; do not pursue unrelated cleanup.

## Token Efficiency Lesson — 2026-09-23

- The owner reports only 9% credit remaining. Treat every remaining request as a tightly scoped task.
- Too many tokens were spent on broad `rg` searches whose output was truncated, reading large code ranges,
  explaining implementation details repeatedly, and running overlapping syntax checks after each small patch.
- For follow-up fixes, inspect only the exact selector/function already identified, apply one minimal patch,
  run one focused validation, and report the result in one or two sentences.
- Mistake: “ข้อความในปุ่มไม่อยู่ตรงกลาง” was misread as moving the whole upload button to the center.
  Fix: restore the button's original left position and center only its internal text/icon vertically.
  Future rule: distinguish element position from content alignment before editing layout.
- Mistake: Example Tech Lead was assumed to be “หัวหน้าช่าง ก” without confirmation, causing `lead_technician`
  to be linked to the wrong person and the Tech Lead's separate account to be removed.
  Fix pending: wait for the owner's verified real names of every technician, then repair all account/person/
  technician links in one migration while preserving existing cases, reports, QC and work history.
  Future rule: never infer a real person's identity from role, nickname, ordering, or an existing placeholder.
- The account work expanded across several files before the real staff identity mapping was confirmed.
  Future rule: when identity data is uncertain, build reversible UI/status visibility first; do not migrate,
  merge, rename or delete identity records until the owner confirms the mapping.
- Preserve successful work already added: account username/password administration, styled delete confirmation,
  account-only deletion with related records retained, history visibility, QC-to-case links, and alternate-channel
  customer approval evidence/signature upload. Do not redo these while correcting technician identities.

## Project Identity

Project: I-MODE Plus Service & Maintenance
Current release: **Beta 1.0 Service focus full system**

Seven places carry it and all seven must move together: `index.html`'s `<title>`, its sidebar
version block (`Version Beta 1.0` / `Service focus full system`), its topbar brand
(`Service focus full system · Beta 1.0`), two lines in `js/06-v68ModulesScript.js`, and the
`<title>` and brand line in `service-case-detail.html`, which keeps its own copy.

**Editing the markup alone silently reverts**, because `js/06` rewrites the sidebar version
block on every render. That trap has been hit twice.

The release was `V6.8 Service focus` until 2026-09-09, then `Beta Service focus`, then this
on 2026-09-10 — each at the owner's request. Older text further down this file still says
V6.8; this section is the current one. Do not rename it, and do not "restore" an older
string.

Primary application entrypoint: `index.html` — **markup only**. See Architecture.

This is an existing Service & Maintenance management system.

This is NOT a CRM project.
CRM and Sales CRM were intentionally removed.
Do not reintroduce CRM or Sales CRM.

Treat the current repository and deployed V6.8 behavior as the source of truth.

---

## Working Principle

Before changing code:

1. Inspect the relevant current code.
2. Search all definitions of related functions.
3. Identify the active / last definition.
4. Check related CSS and DOM.
5. Check localStorage impact.
6. Check Supabase impact.
7. Make the smallest safe diff.
8. Validate before finishing.

Do not perform unrelated cleanup.

Do not rewrite `index.html`.

Do not migrate the application to React, Vue, Next.js, or another framework unless explicitly requested.

---

## Architecture

**`index.html` has been markup only since 2026-09-07.** It was a single 1.08 MB file with
everything inline; the CSS and JavaScript were split out and it is now about 80 KB.

- `css/NN-*.css` — 23 stylesheets, loaded by `<link>` in numeric order
- `js/NN-*.js` — 41 scripts, loaded by `<script src>` in numeric order
- `auth/*.js` — the authentication layer (4 files)
- `pages/customer-portal…` — see below
- `vendor/jsQR.min.js` — the QR decoder, vendored rather than fetched from a CDN

**The number prefix IS the load order. Never reorder or renumber.** The whole application
is patch-over-patch: `js/03-app-core.js` is the original 542 KB application and `js/04`
onward are patches that wrap or override it, newest last. `css/21` and `css/23` must stay
the last two stylesheets — they also have to win over `<style>` blocks that `js/10` and
`js/16` append to `<head>` at runtime.

One page is not in `index.html` at all: the customer page lives in `pages/customer-home.html`
and is inserted into `<main>` by `pages/pages.js`, a `<script src>` sitting where the
`<section>` used to be. **The app must therefore be opened over http** (Live Server, GitHub
Pages); a plain `file://` double-click cannot read the fragment and the portal falls back to
a notice.

Expect, and do not be surprised by:

- multiple IIFEs, and the same function assigned to `window` by several files
  (`goPage` is wrapped eleven times — that is the architecture, not a bug)
- top-level `let` / `const` that are **lexical globals shared across script files but NOT
  present on `window`** (`settings`, `cases`, `machines`, `customers`, `technicians`,
  `currentUser`, `qcRecords`, `supa`, `cloudSettings`, `PAGE_PERMISSION`, `MODULES`…).
  Read and assign them by bare identifier. **`window.settings` is `undefined`** — writing
  that has silently broken four separate features in this project, most recently session
  expiry, which never fired for weeks because `window.currentUser` is always undefined.
- duplicated definitions, and later patches overriding earlier ones
- localStorage persistence with optional Supabase synchronization

Important:

Do not assume the first function definition is the active one.

`grep -n "function name" js/*.js` shows every definition; the file order tells you which one
wins. Search the whole workspace, not one file.

---

## Main Workflow

Primary Service workflow:

Customer / LINE OA / Phone / Email
→ Customer Master
→ Machine Master
→ Service Case
→ Quotation when required
→ Technician Assignment
→ Calendar / Appointment
→ Field Service
→ Service Report
→ Machine QC
→ Warranty / Machine Documents
→ Close Service Case
→ Dashboard / Reports

---

## Current Modules

Preserve these existing functional areas:

1. Dashboard
2. Customers
3. Machines
4. Service Cases
5. Quotation
6. Onsite / Work Site Pricing
7. Service Maintenance
8. Calendar
9. Field Service
10. Machine QC
11. Spare Parts
12. Purchase Orders
13. Petty Cash
14. Warranty
15. Machine Documents
16. Notifications
17. Reports
18. Settings
19. Customer Portal / QR / LINE OA workflow

Do not remove a module without explicit instruction.

---

## Technician Role

Normal Technician UX should focus on approximately 8 functional areas:

1. My Work / Technician Home
2. Calendar
3. Field Service
4. Machine QC
5. Parts for Job
6. Machine Information / Documents
7. My Expenses
8. My Reports

Normal Technicians should not manage:

- quotation approval
- global pricing
- purchase order administration
- entire department petty cash
- system settings
- users and roles
- cloud/Supabase configuration
- company-wide reports

Field Service is the main operational workspace.

---

## Field Service Workflow

Expected technician workflow:

Assigned Job
→ Appointment
→ Traveling
→ Arrived
→ GPS Check-in
→ Inspection
→ PM / Maintenance / Service
→ Repair
→ Waiting Parts if required
→ Testing
→ Customer Acceptance
→ Signatures
→ Service Report
→ Finish Job

Existing field statuses include:

- กำลังเดินทาง
- ถึงหน้างาน
- เริ่มตรวจเช็ก
- กำลัง PM / Maintenance
- กำลังซ่อม Service
- รออะไหล่
- ทดสอบเครื่อง
- รอลูกค้าตรวจรับ
- จบงาน

Existing features include:

- GPS Check-in
- status timeline
- photos
- videos
- Before / After photos
- Service / PM checklist
- diagnosis
- work performed
- recommendation
- replaced parts
- customer signature
- technician signature
- next PM date
- Service Report

High-priority future improvements:

- Timesheet / Work Time Tracking
- Parts Request / Issue / Return
- Closing Gate validation

Prefer integrating these into existing Field Service / Parts UX instead of adding unnecessary top-level modules.

---

## Service Case Workflow

Default statuses:

- เคสใหม่
- มอบหมายแล้ว
- นัดหมายแล้ว
- กำลังดำเนินการ
- รออะไหล่
- รอส่งงาน
- เสร็จสิ้น
- ปิดเคส

Important:

`รออะไหล่` is conditional.

Do not design logic that forces every Service Case through every status.

Example valid branch:

กำลังดำเนินการ
→ รออะไหล่
→ กลับไปกำลังดำเนินการ

Another valid branch:

กำลังดำเนินการ
→ ทดสอบ
→ รอส่งงาน

---

## Machine Master

Machine Master is a central data source.

It links to:

- Customer
- Service Case
- Quotation
- QC
- Warranty
- Documents
- Spare Parts
- Service History
- Customer Portal / QR

Machine pagination already exists.

Preserve:

- 10
- 25
- 50
- 100
- All
- Previous
- Next
- page numbers
- Search
- Service Filter
- Warranty Filter
- Size Filter

Filters and search should reset pagination appropriately.

Do not modify Serial, Customer, Warranty or Service Status merely to satisfy UI/image logic.

---

## Machine Image Rules

Image priority:

1. Actual user uploaded `m.photo`
2. Exact-model reference image
3. Machine-family reference image
4. No Image

Reference images must not be persisted back into `m.photo`.

Actual uploaded photos always win.

Reference machine images should normally use:

`object-fit: contain`

Reference images may show:

`ภาพอ้างอิง`
or
`Reference Image`

---

## Machine QC

QC types:

- Incoming Inspection
- Pre-Delivery QC
- Post-Service QC
- Installation Acceptance
- PM Verification

QC statuses:

- Draft
- In Progress
- Pass
- Conditional
- Fail

Checklist states:

- Pending
- Pass
- Fail
- N/A

QC links:

Customer
→ Machine
→ Service Case
→ QC Result

QC document must remain a Thai two-page document.

Page 1:
- general information
- checklist
- result
- signatures

Page 2:
- problem/damage/missing-equipment evidence
- findings
- corrective action
- photos

Videos may be stored but do not need to print.

Historical bug to verify before touching QC:

`window.qcDocHTML()` previously referenced `qcTypeThai()` from another IIFE scope.

This could cause:

`ReferenceError: qcTypeThai is not defined`

Do not assume the bug still exists.
Inspect the current active implementation first.

If present, fix only the scope problem unless another change is requested.

---

## Quotation

Quotation is Service-oriented.

Possible inputs:

- Customer
- Service Case
- Machine
- Machine Size
- Service Type
- Distance
- Travel Zone
- Google Maps
- Urgency
- Warranty
- Parts
- Labor
- Discount
- VAT

Do not introduce CRM.

Onsite pricing must not silently overwrite an existing quotation.

Require user confirmation before applying pricing.

Quotation statuses include:

- ร่าง
- ส่งแล้ว
- รออนุมัติ
- อนุมัติ
- ไม่อนุมัติ
- หมดอายุ

---

## Onsite Pricing

Current pricing concept:

S = 500 THB
M = 1,000 THB
L = 1,500 THB

Travel Zones:

Z0: 0–15 km = 250
Z1: 16–30 km = 400
Z2: 31–50 km = 600
Z3: 51–80 km = 900
Z4: 81–120 km = 1,300
Z5: 121–180 km = 1,900
Z6: >180 km = 10 THB/km or manual case-by-case

Formula:

Service Level
+ Travel Zone
+ Spare Parts
+ Actual Cost

---

## Spare Parts

Spare Part data includes concepts such as:

- Part No.
- Name
- Supplier
- Unit
- Current Qty
- Min Qty
- Max Qty
- Reorder Point
- Lead Time
- Location
- Model tags
- Machine mapping

PO statuses:

- รออนุมัติ
- สั่งซื้อแล้ว
- รับเข้าแล้ว
- ยกเลิก

Future technician workflow should support:

Parts Request
→ Reserve
→ Issue
→ Use
→ Return
→ Stock Movement
→ Service Report

Do not give normal Technicians unrestricted PO management.

---

## Petty Cash

Current statuses:

- รอเคลียร์
- เคลียร์แล้ว
- ยกเลิก

For technicians, prefer a simplified:

`My Expenses`

linked directly to Service Case.

Do not expose the complete department Petty Cash ledger to normal technicians.

---

## Warranty

Warranty is linked to:

- Customer
- Machine
- Serial
- Service history

Possible data:

- purchase date
- install date
- warranty start
- warranty end
- duration
- coverage
- exclusions
- attachment
- certificate

---

## Machine Documents

Document categories include:

- Operating Manual
- Technical Datasheet
- Electrical Diagram
- Mechanical Drawing
- PM Checklist
- SOP / Work Instruction
- Software / Firmware
- Calibration / Certificate
- Spare Parts List
- Training Material

---

## Customer Portal

Customer Portal / QR / LINE OA is customer-facing and must remain separate from internal staff UX.

Possible customer functions:

- report a problem
- check service status
- request Service quotation
- check Warranty
- request Warranty quotation
- view Service history
- access manuals/documents
- contact Service

Preserve existing customer portal mode and its special layout behavior.

---

## Responsive Rules

Desktop:
- Sidebar visible
- Topbar usable
- tables usable

Mobile:
- hamburger/sidebar drawer
- compact topbar
- bottom navigation
- mobile cards
- no topbar overflow

Do not regress the existing mobile Calendar behavior.

Do not redesign Settings responsive layout unless explicitly requested.

---

## Important Assets

Favicon:

`./assets/Iconservice.png`

Sidebar UI Logo:

`./assets/imode-ui-logo-v532.png`

Document / QR / QC Logo:

`./assets/imode-document-logo.webp`

Do not swap UI and document logos.

GitHub Pages paths are case-sensitive.

Prefer relative paths:

`./assets/...`

---

## Persistence Safety

Important localStorage keys:

- `imode_test_v532_cases`
- `imode_v5_tech`
- `imode_test_v532_customers`
- `imode_test_v532_machines`
- `imode_test_v532_notifications`
- `imode_test_v532_quotes`
- `imode_v5_settings`
- `imode_v5_cloud`
- `imode_v5_current_user`
- `imode_test_v532_warranties`
- `imode_test_v532_machine_documents`
- `imode_test_v532_line_requests`
- `imode_test_v532_service_reports`
- `imode_v66_qc_records`
- `imode_v67_petty_cash`
- `imode_v67_spare_parts`
- `imode_v67_purchase_orders`

Added by the login system (2026-09-07), same rules apply:

- `imode_v69_session`
- `imode_v69_auth_audit`
- `imode_v69_auth_lock`
- `imode_v69_local_pw`
- `imode_v69_sb_auth`

Clearing `imode_v69_session` signs the user out; clearing `imode_v69_local_pw` restores
the built-in UAT passwords. Neither destroys business data.

Do not rename existing keys without explicit approval.

NEVER use:

`localStorage.clear()`

Do not reset user data as part of a UI fix.

---

## Supabase Safety

Existing cloud synchronization may use:

- service_cases
- technicians
- customers
- machines
- notifications
- system_settings
- quotations
- machine_warranties
- machine_documents
- line_customer_requests
- service_reports

Do not change:

- Supabase Project URL
- Anon / Publishable key
- table names
- cloud connection logic

unless explicitly requested.

Never add a Service Role key to frontend code.

Never expose secrets.

---

## Deployment

The current UAT deployment uses GitHub Pages.

Repository/project name is associated with:

`ImodeService`

When changing assets:

- use correct filename casing
- use relative paths
- check for 404s
- verify GitHub Pages subpath compatibility

Do not change deployment settings without explicit instruction.

---

## Editing Rules

When asked to change something:

- inspect before editing
- search exact current implementation
- search duplicate definitions
- identify active definition
- make minimum diff
- preserve backward compatibility
- avoid unrelated refactors

Do not create helper files unnecessarily.

Do not perform broad cleanup unless requested.

---

## Validation

The JavaScript lives in `js/*.js`, `auth/*.js` and `pages/pages.js`. There is no inline
script left to extract.

After changing a file, syntax-check the ones you touched:

`node --check js/<file>.js`

`node` has been present and absent at different times on this machine. When it is missing,
load the single file in a browser with an `error` listener instead — **a parse error in a
classic script is silent; its only symptom is that the script's globals are missing.**

Also inspect runtime risks:

- ReferenceError
- IIFE scope
- duplicate `const` / `let`
- **`window.<name>` where `<name>` is a top-level `let`** — always `undefined`; see
  Architecture
- function override order
- `el.hidden = true` on an element that an author rule gives a `display`. The author rule
  wins and the element stays visible. `css/23` now ends with
  `[hidden]{display:none!important}`, which closes this for the whole project — do not add
  another one-off patch for it.

Syntax check alone is not enough.

Perform UI regression checks after each task, at **desktop, tablet and phone widths**. If
you drive a headless Chrome, set the viewport with `Emulation.setDeviceMetricsOverride`:
`--window-size` is clamped to about 500px on Windows, so "390px" runs were really 500px and
never tested a real phone width.

---

## First-Session Behavior

If this is the first task in a new session:

1. Read this `AGENTS.md`.
2. Inspect repository structure.
3. Inspect current `index.html`.
4. Do not modify files yet.
5. Summarize:
   - architecture
   - modules
   - persistence
   - active scripts
   - duplicated/overridden functions
   - Service workflow
   - Technician workflow
   - known risks

Then wait for the user's requested coding task.

If the user already gave a specific coding request, proceed with that request after inspection instead of asking for unnecessary confirmation.

---

## Session Change Log — 2026-09-05 → 2026-09-06

All edits were made in `index.html` (single file). No storage key was renamed, no Supabase
setting was touched, no user data was reset.

### 1. Modal close policy

- Codex had added a stripper inside `openModal()` that deleted every "ยกเลิก" button.
  That stripper was **removed** — the modal body HTML is now passed through untouched.
- The accidental-close guard stays where it was, in the `v671QcQrResponsiveFixScript`
  IIFE (~line 5836): backdrop click and Esc are blocked **only** when
  `modalHasDataEntry()` returns true. Read-only detail popups still close normally.
- Rule to remember: "ต้องกดกากบาทเท่านั้น" means *block the accidental close paths on
  data-entry forms*. It does **not** mean deleting the explicit Cancel button.
- Verified across all 29 data-entry modals. Four settings modals (Travel, Roles,
  Typography, DataBackup) have no Cancel button by original design — left as-is.

### 2. Cases page

- **KPI status cards** replace the old status dropdown, reusing the QC page pattern.
  `renderCaseStatusKpis()` fills `#caseStatusKpis` with `.module-kpi-card` buttons inside
  a new `.case-kpi-grid`. Card 0 is "เคสทั้งหมด", then one card per status from
  `caseFilterStatuses()`. Counts respect the active search + priority filter. Click calls
  `selectCaseStatus()`; the active card is marked `aria-pressed="true"`.
- Grid sizing: `auto-fit, minmax(112px, 1fr)`, with breakpoints at 1500px → 5 columns,
  900px → 3, 640px → 2. All 9 cards fit one row at 1920px.
- `casePriorityFilter` is a dropdown that shows a count per priority.
- Each case row has a "สร้างใบเสนอราคา" button, and the whole row is clickable to open
  the case.
- The duplicated "เคสงานบริการ" title was removed from the panel head.

### 3. Shared list pagination — 8 pages

Two page-specific pagination implementations were replaced by one shared helper:
`paginateList()`, `renderListPager()`, `setListLimit()`, `setListPage()`,
`listPagerState()`, `listPagerRerender()`, `listPageItems()`, driven by
`LIST_PAGER_CONFIG`.

Registered keys: `cases`, `customers`, `qc`, `quotation`, `warranty`, `documents`,
`spareParts`, `pettyCash`.

- HTML id convention: `<key>DisplayLimit` / `<key>TotalCount` / `<key>Pagination`.
  The cases ids were renamed to `casesDisplayLimit` / `casesTotalCount` /
  `casesPagination` to fit this convention.
- Markup reuses the existing `machine-pagination` / `machine-page-*` CSS classes.
- Limits are 10 / 25 / 50 / 100 / All, matching the machines page.
- **The machines page keeps its own original pager** — it was not migrated, and the rule
  above that its 10/25/50/100/All pagination must be preserved still stands.

### 4. Machines

- **KPI cards added**, inside the `v68MachineLimitQcActionFix` IIFE:
  `renderMachineKpis()` plus `window.setMachineKpiFilter(kind, value)`, called at the top
  of `window.renderMachines`. Five cards: เครื่องทั้งหมด / ต่อ Service / ไม่ต่อ Service /
  อยู่ในประกัน / หมดประกัน.
- **Machine size is now S / M / L** (M was missing). Added `normalizeMachineSize()`, an
  M option in `maSize` and `machineSizeFilter`, the `Medium Machine` mapping in
  `saveMachine` and `setQuoteMachineSize`, M in the quote size picker, and a green
  `.machine-size-badge.M`.
- Pricing note: the `machineRate` at ~line 5279 handles only S and L and returns 0
  otherwise, but it is **dead code** — `window.machineRate` at ~line 5766 overrides it and
  resolves `c[prefix + size]`, so M reads `onsiteM / workshopM / diagnosisM / nextM /
  laborM` from the existing rate config. Verified M = 2250 / 1150 / 750 / 1150.

### 5. Quotation — Google Maps button

- The button was correct; there was simply no Google Maps API key configured. Added a
  free no-key fallback: `quoteMapsPoint()`, `quoteDirectionsUrl()`, `openQuoteDirections()`
  build a `https://www.google.com/maps/dir/?api=1` URL. A customer's own `mapUrl` wins if
  it is set.
- **Regression fixed:** `quoteCustomerChanged()` (~line 5331) calls
  `calculateQuoteDistance(false)` automatically, so the first version of the fallback
  opened a Maps tab merely by selecting a company. The tab now opens only when
  `showToast === true`, which only the 📍 button passes.
- The error/catch branch also offers an "เปิด Google Maps" button.

### 6. Layout cleanup

- `PAGE_INFO` hero subtitles moved (th/en at ~line 4159; petty-cash and spare-parts at
  ~lines 5830-5833).
- Duplicate `.plain-module-intro` blocks and duplicate panel `<h3>` titles removed from:
  qc, petty-cash, spare-parts, technicians, machines, quotation, customers, warranty,
  documents, cases.
- Action buttons moved out of the standalone top rows and into the `.panel-head` row on:
  QC, petty cash, spare parts, customers, technicians (the team segment moved up too),
  and reports ("📄 ตั้งค่ารายงาน" now sits in the "สรุปประสิทธิภาพงาน Service" panel head).
  The emptied `.plain-module-intro` / `.module-action-row` / `.team-toolbar` wrappers were
  deleted.

### 7. Codex hand-off items

All five items Codex started were confirmed code-complete and then verified in a headless
browser: quotation button per case row, clickable case row, status filter buttons,
data-entry popups that resist backdrop/Esc, and the merged date+time picker.

### Validation harness

Built in the session scratchpad (deliberately **not** added to the repo, per the
"no unnecessary helper scripts" rule):

- `syntax-check.js` — extracts every inline `<script>` and runs `node --check` on it
- `ui-check.js` — headless Chrome over CDP against a local static server, with CDN,
  Supabase and Maps requests blocked; runs `ui-assertions.js`; pass `mobile` for 390×844
- `shot.js` / `shot-wide.js` — clipped screenshots for layout checks

### Verified facts about the current build

- **No routing.** `pushState | replaceState | popstate | hashchange | history.back` has
  **zero** matches. `goPage()` only toggles `.page.active`. The only URL handling is
  `initPortalFromUrl()` reading `?machineToken=` and `#/customer-portal`.
- **No audit / SLA / approval engine.** `audit.view` is a permission label in the roles
  table, `sla.autoEscalateMin` is a settings value, and `bhAudit` is a toggle in the
  System Behavior modal. Nothing writes an audit log or escalates a case.
- **Four disconnected identity sets:** `demoUsers` (8, hard-coded), `technicians`
  (`imode_v5_tech`, T001–T003), `settings.relatedEmployees` (EMP-*), and `customers`
  (CUST-*). `currentUser` links to none of them; Field Service matches the logged-in
  technician by **name string**. There is no logout, no password field, and no Customer
  role yet.

### Deferred / open

- **UAT accounts and roles** (`admin_test`, `technician_test1`, `technician_test2`,
  `customer_test1`). Already decided: a plain UAT login with hashing;
  `enforceRolePermissions` stays `false` for now; the customer sees their own company's
  machines, i.e. the post-QR-scan page. Still undecided: which technician records
  `technician_test1/2` map to, and which customer `customer_test1` maps to.
- The `Admin / Coordinator` role has no `quotation.create` permission — to be discussed
  together with the account work.
- UAT passwords stored client-side are visible in DevTools. They must never be real staff
  passwords.

### UI spec documents (11 PDFs, v1.0 • 15 Aug 2026) — gap summary

Reviewed for understanding only; no code was changed to match them. The specs define
10 modules / 39 popups / 96 web pages / 135 surfaces, a Popup-vs-WebPage decision
standard, a Core Data Contract (Machine → Case → Owner → Status → Next Action), six
mandatory system states, design tokens (sidebar 208px, topbar 72px, content 1440px,
Primary `#0B63E5`, Navy `#073763`, Success `#079455`, Warning `#F79009`, Danger
`#E31B2F`), telemetry events and a Definition of Done.

Gaps against the current build: no routing to support the required Deep link / Browser
Back / Breadcrumb on any page; no audit, SLA or approval engine; long multi-step forms
live in modals rather than in web pages. Conversely the app has modules the master spec
does not cover: QC, Petty Cash, Onsite Pricing (S/M/L plus travel zones Z0–Z6),
standalone Warranty, and the Customer Portal / LINE OA. **The Calendar spec was not
provided** (the master lists 4 popups / 6 web pages for it).

---

## Session Change Log — 2026-09-06 (part 2): UAT accounts & roles

Added as one new patch script, `v68UatAccountsScript`, at the end of `index.html`.
Additive only: no existing function body was rewritten, no storage key renamed, no
Supabase setting touched. Every change lives inside the new IIFE, which wires itself in by
overriding globals (`goPage`, `openUserLoginModal`, `renderCustomerPortal`,
`initPortalFromUrl`) in the same patch-over-patch style the rest of the file uses.

### Accounts

| Username | Role | Linked record |
|---|---|---|
| `admin_test` | Admin / Coordinator | — |
| `technician_test1` | Technician | `T001` สมชาย ใจดี |
| `technician_test2` | Technician | `T002` ณัฐพล ช่างดี |
| `customer_test<N>` | Customer | `CUST-000<N>` |

- Customer accounts are generated from the live `customers` array, so **every customer in
  the system has a login**. The username comes from the numeric suffix of the customer id
  (`CUST-0001` → `customer_test1`), never from the array position, so the mapping cannot
  shift when a customer is added, removed or reordered. An id with no numeric suffix falls
  back to a slug of the id.
- `CUST-INTERNAL-IMODE` — created by `ensureInternalCustomer()` in the v67 IIFE for QC,
  internal issue and spare-parts work — is **excluded**. It is I-MODE's own record, not an
  external customer. It sits at index 0 of `customers`, which is why a position-based
  username would have stolen `customer_test1` from ลูกค้าตัวอย่าง 1.
- Current demo data: 11 customer rows → 10 customer accounts, 13 accounts in total.
- `customer_test1` = `CUST-0001` = บริษัท ลูกค้าตัวอย่าง 1 จำกัด (19 machines).

### Passwords

- Staff passwords are stored only as SHA-256 hex constants, so the plaintext is not in the
  source. (In the public repository the hashes are left empty.)
- `sha256()` is a self-contained synchronous implementation rather than `crypto.subtle`,
  so the login also works when `index.html` is opened from `file://`, where
  `crypto.subtle` is unavailable. Verified against node's `crypto` on 15 vectors,
  including multi-block and UTF-8 input.
- **This is a UAT-only client-side login, not real authentication.** The convention is
  readable in the source. Never put a real staff password here.

### Behavior

- The login modal keeps everything it had — the 8 demo users and the manual-name form —
  and the UAT username/password form is inserted above them. A collapsible list shows all
  test accounts with the record each one maps to.
- `admin_test` → the normal application, no forced page change.
- `technician_test*` → opens Field Service on their own technician record. `currentUser.name`
  is set to the technician's own name because Field Service matches by name string.
- `customer_test*` → the post-QR-scan Customer Portal for their own company. `goPage()` is
  wrapped so a customer session cannot leave the portal, the portal `×` becomes ออก
  (logout), and when the company has more than one machine a picker above the machine card
  switches between them. The portal actions themselves are unchanged.
- A customer session is restored on reload, unless the URL carries a `machineToken` — a
  scanned QR wins over the stored session.
- `uatLogout()` clears `currentUser`, leaves portal mode and returns to the dashboard.
  This is the application's first logout.

### Field Service defect found (not fixed app-wide)

`renderFieldService()` (~line 4871) starts with

```js
const cur=fieldTechSelect.value||fieldTechId||technicians[0]?.id||''
```

so the stale `<select>` value **wins over `fieldTechId`**. `openFieldService(tid)`
therefore fails to switch technicians once the select has already been rendered. Rather
than change that shared function, `openTechnicianWorkspace()` in the new script points the
select at the technician before calling `openFieldService()`. **The underlying precedence
bug is still there** and will affect any other caller that passes a technician id.

### Permissions

`enforceRolePermissions` is still `false`, as agreed. `settings.roles` has no `Customer`
role, so a customer session is confined by the `goPage()` wrapper, not by the permission
engine. Adding a real `Customer` role is still open, together with the missing
`quotation.create` permission on `Admin / Coordinator`.

### Validation

- `node --check` on all 8 inline scripts: 0 failures.
- Headless-Chrome suite, 49 assertions, at 1440×1000 and 390×844: all pass, with no
  console errors and no page errors. It covers wrong-password and unknown-user rejection,
  each account's link, portal confinement (`cases`, `settings`, `machines`, `quotation`
  and `exitCustomerPortal` all bounce back), the machine picker, logout, and an actual
  login for every generated customer account.
- Regression suite, 16 assertions: cases KPI cards, the 8 shared pagers, machines KPI +
  its own pager + the S/M/L filter, and the quotation Maps behaviour (no auto-open when a
  customer is selected, opens on the 📍 button) all still pass.
## Session Change Log — 2026-09-06 (part 3): role-based Home Pages

One new patch script, `v68RoleHomeScript`, at the end of `index.html`, plus three small
edits inside `v68UatAccountsScript` so the Home Pages reuse the existing login instead of
adding a second one. No new framework, no router, no new user / role / permission store.
`index.html` is the only file changed. Version untouched.

### New pages

Injected into `<main>` by JS, so the giant existing markup was not edited:

- `#page-home` — Admin / Technician Home
- `#page-customer-home` — reached from a machine QR, before login
- `#page-customer-login`

`goPage()` is wrapped: it creates these pages on demand, toggles `body.rhome-mode` (which
hides sidebar, topbar, hero and bottom nav), and renders the right one. Leaving a Home
page restores the full application chrome.

### Existing systems reused — nothing re-created

- **Login validation:** `window.uatAuth.login()`, the same `sha256` check and account
  registry from part 2. The Customer Login page calls it; it has no login of its own.
- **Session:** the same `currentUser` global and `imode_v5_current_user` key.
- **Roles:** `settings.roles` + `currentRoleConfig()`.
- **Permissions:** the same precedence as the active `window.canPermission` — an enabled
  `settings.userPermissions[<user key>]` entry wins, otherwise the role's `permissions`
  array. Its `enforceRolePermissions` short-circuit is deliberately **not** applied,
  because that toggle is off and the Home Page must still show only what the role grants.
- **Navigation:** `goPage(name)`, wrapped, never replaced.
- **QR:** the existing `?machineToken=` and `machineByQrToken()`.
- **Portal:** `enterCustomerPortal()` from part 2.

### Post-login destination

`uatSubmitLogin` now calls `window.imodeRoleHomeAfterLogin()`, so staff — Admin and
Technician — land on `#page-home`, not the Dashboard. Customers still go straight to their
portal. `chooseUser` (the 8 demo users) and `saveManualUser` are wrapped so the legacy
logins land on the Home Page too.

### Admin / Technician Home

One dominant centre circle; module circles at **varying** radii (factors 0.80–1.15 with
per-index angle jitter) so the composition is organic rather than a perfect ring; one SVG
connector line per circle with a mid-point node. Centre click → Dashboard. Small circle
click → `goPage(<module>)`. No merge animation for staff. A `⌂` button is added to the
topbar so staff can return Home.

### Customer Home and the merge animation

Entry state is explicit — `entryMode='customer-qr'`, set by the wrapped
`initPortalFromUrl` — not inferred from how the page looks. The QR context card shows the
machine name, model and serial. The seven circles are journey visuals only: they carry
`aria-disabled="true"`, open no module, and only hint back to the centre.

One click on the centre (the button then disables itself): the centre glows, connector
lines fade, each circle travels to the centre on a 70 ms stagger while scaling to 0.18 and
fading, the centre becomes **Customer**, pulses green, and after ~520 ms the page becomes
`#page-customer-login`. Total ≈ 1.2 s for seven circles. Under
`prefers-reduced-motion: reduce` the circles simply fade and the flow finishes in ~370 ms.

### Customer Login

Username / password against the shared auth. A staff account entered here is rejected and
the session cleared. The LINE button renders **only** when LINE OA / LIFF is configured —
there is no LINE authentication in this codebase, so with no config it is omitted rather
than faked.

### Field Service fix

`renderFieldService()` prefers the existing `fieldTechSelect.value` over `fieldTechId`
(recorded in part 2). Because technicians now reach Field Service from a Home circle
instead of through `openTechnicianWorkspace()`, they were landing on **T001's** queue. The
`goPage()` wrapper now points the select at `currentUser.technicianId` before the page
renders, so a technician account always sees its own queue whichever entry point is used.

### What the permission data currently produces

- **Admin / Coordinator** → 15 circles: Dashboard, Service Cases, Customers, Machines, QC,
  Calendar, Field Service, Service Maintenance, Warranty, Documents, Notifications,
  Reports, Worksite, Spare Parts, Petty Cash.
- **Technician** → 12 circles: the same, minus Worksite, Spare Parts and Petty Cash.
- Neither shows **Settings** (no `settings.manage`) or **Quotation** (no `quotation.view`).

`onsite`, `spare-parts` and `petty-cash` have no key in `PERMISSION_CATALOG`, so rather
than invent one they follow a documented rule: they are shown to roles that can assign work
or administer the system (`case.assign` / `settings.manage` / `users.manage`). Admin has
`case.assign`; Technician does not.

### Responsive and accessibility

A wide 1000×700 coordinate stage on desktop and tablet, a tall 700×1000 one at ≤640px,
re-rendered on breakpoint change; circle diameters clamp to ≥48px on mobile. Every circle
is a real `<button>` with an `aria-label` and a visible `:focus-visible` ring, so keyboard
Enter/Space work.

Note on the header logo: `imode-ui-logo-v532.png` is a white wordmark made for the blue
sidebar, so on the white Home header it is placed on a brand-coloured chip. Asset roles are
unchanged.

### Tests run

- `node --check` on all 9 inline scripts: 0 failures.
- Journey suite, 66 assertions, at 1440×1000, 768×1024 and 390×844, each with
  `prefers-reduced-motion` both `no-preference` and `reduce` — six runs, all pass, no
  console errors and no page errors. Covers admin and technician landing on Home rather
  than Dashboard, chrome hidden, circles matching role permissions, centre → Dashboard,
  circle → module, varying radii, one connector per circle; QR → Customer Home, journey
  circles opening nothing, single-click merge with a repeat-click guard, circles
  measurably travelling and scaling toward the centre, the centre becoming "Customer",
  navigation to Customer Login, wrong password, a staff account rejected at the customer
  door, a real customer login reaching their own portal, the back button, and an invalid
  token showing a warning while leaking no serial.
- Regression suite, 30 assertions, desktop and mobile: cases KPI cards, the 8 shared
  pagers, machines KPI + own pager + S/M/L, quotation Maps behaviour, the modal Cancel
  button and backdrop guard, the 13 UAT accounts, technician self-selection in Field
  Service, the customer portal machine picker, the staff portal preview, all 17 existing
  pages reachable, sidebar restored outside Home, no horizontal overflow, and both version
  strings unchanged.

### Limitations and risk

1. **A machine QR now requires a login.** It previously opened the portal directly; it now
   opens Customer Home and the visitor must sign in. This is the requested flow, but it is
   a real behaviour change for anyone using the QR / LINE entry today.
2. A logged-in customer who scans another company's QR still sees that machine's portal —
   unchanged public-QR behaviour, not introduced here.
3. Quotation and Settings do not appear on Admin Home because `Admin / Coordinator` holds
   neither permission. Fix by ticking them in Settings → Roles, or by adding
   `'quotation.view','quotation.create'` to the preset at `index.html:3922`.
4. There is still no `Customer` role in `settings.roles`; a customer session is confined by
   the `goPage()` wrapper, not by the permission engine, and `enforceRolePermissions`
   remains `false`.
5. No routing was added, so the Home Pages have no deep link and no browser Back — exactly
   like every other page in this application.
## Session Change Log — 2026-09-07 (part 4): real login system

The production database is not reachable yet, so the login was built around a **provider
seam** instead of being wired to one backend. The application only ever calls `ImodeAuth`;
what verifies the password underneath is swappable, so pointing this at the real database
later is a configuration change, not a rewrite.

### New files — the first code outside `index.html`

| File | Purpose |
|---|---|
| `auth/auth-core.js` | session, absolute expiry, idle timeout, lockout, audit, offline grace |
| `auth/auth-local.js` | offline / UAT provider — delegates to `window.uatAuth`, no second password check |
| `auth/auth-supabase.js` | Supabase Auth provider — server-side bcrypt, JWT, reset mail |
| `auth/auth-integration.js` | wires `ImodeAuth` into the app; the only file that knows both sides |
| `supabase/01-schema.sql` | `profiles`, `auth_audit`, RLS helper functions |
| `supabase/02-rls.sql` | Row Level Security for all 11 tables |
| `supabase/03-users.sql` | links accounts to app records + verification queries |
| `supabase/README.md` | step-by-step handover for IT |

Loaded with classic `<script src>`, **not** ES modules, so `index.html` still opens from
`file://` — verified in a headless browser: providers register, sign-in works, no errors.

### New localStorage keys (additive; no existing key was read differently or renamed)

| Key | Owner | Holds |
|---|---|---|
| `imode_v69_session` | auth-core | the cached session |
| `imode_v69_auth_audit` | auth-core | sign-in audit ring buffer (200 entries) |
| `imode_v69_auth_lock` | auth-core | failed-attempt and lockout state |
| `imode_v69_local_pw` | auth-local | password-hash overrides from "change password" |
| `imode_v69_sb_auth` | auth-supabase | Supabase tokens (managed by supabase-js) |

`imode_v5_current_user` keeps its old meaning and is still written by `saveLocal()`.

### Changes inside `index.html`

Three small edits, all in `v68UatAccountsScript` and `v68RoleHomeScript`:

- `window.uatAuth` gained `verify`, `findAccount`, `accountToUser`, `hash` and
  `setSessionUser`. `verify()` checks a password **without** touching the session, so the
  provider layer owns session creation instead of the registry.
- `submitCustomerLogin()` on the Customer Login page now calls `window.imodeSignIn`, so
  the customer door uses the same provider, lockout, expiry and audit as the staff door.
- Four `<script src>` tags before `</body>`.

### What the login now does

- **Absolute expiry** 12 h, **idle timeout** 4 h, **offline grace** 7 days — all in
  `settings.authConfig`, all enforced in `auth-core.js`.
- **Lockout** after 5 failed attempts for 15 minutes, per username. Browser-side, so it
  slows a person at the keyboard; Supabase's own rate limit is the one that counts.
- **Audit trail** of sign-in / sign-out / change-password, kept on the device and pushed
  to `auth_audit` when a server provider is active.
- **Password policy**: at least 8 characters, letters and digits, not equal to the username.
- **Change password** works on both providers. On `local` it stores a hash override for
  that device; `ImodeAuthLocal.resetLocalOverride(username)` undoes it.
- **Offline banner** appears while a session is alive only because the device is offline.
- **Session migration**: anyone already signed in when this shipped keeps their session
  rather than being kicked out, but it now expires like any other.

### Deliberate design decisions

- **When Supabase Auth is configured, the local UAT accounts stop working.** Leaving them
  enabled beside a server check would be a documented way around it.
  `settings.authConfig.allowLocalFallback = true` opts back in, knowingly, for UAT.
- **No offline first sign-in.** A device that has never signed in needs network. A local
  password check would be exactly the bypass this removes. Continuity comes from the
  cached session, not from a second password store.
- **The customer door refuses staff accounts; the staff modal accepts customers.** Anyone
  can reach the customer login by scanning a machine QR, so that door is the one that must
  be strict. A customer signing in from the staff modal gains nothing — the `goPage()`
  wrapper still confines them to their portal.
- **RLS matters more than the login screen.** The anon key ships in every browser, so
  without `02-rls.sql` anyone can call the REST API directly and the login is decoration.
  This is stated at the top of that file and in the README.

### Tests run

- `node --check` on all 9 inline scripts and all 4 new files: 0 failures.
- **Auth suite, 57 assertions** — provider registration and selection, `verify` not
  mutating state, sign-in / sign-out, session persistence to its own key, audit entries,
  wrong password, unknown user, lockout after repeated failures (including that it does
  not affect other accounts and clears on success), absolute expiry, idle timeout, offline
  grace working while offline **and being refused while online**, grace window ending,
  password policy, change password and the old password ceasing to work, admin reset of
  the override, staff modal sign-in and error handling, staff rejected at the customer
  door, customer accepted at the staff modal but still confined.
- **Journey suite, 66 assertions** — unchanged, still passing.
- **Regression suite, 30 assertions** — unchanged, still passing.
- **`file://` load check** — external classic scripts load, `ImodeAuth` registers both
  providers, `admin_test` signs in and lands on the role Home page, zero page errors.

### Not done / open

1. **Nothing was run against a real Supabase project.** `auth-supabase.js` and the three
   SQL files are written and reviewed but untested end to end; that needs the project
   owner to run them and work through the checklist in `supabase/README.md`.
2. **`machines` column naming is unverified.** Every other table is pushed as snake_case,
   but `cloudUpsert('machines', obj)` sends the raw JavaScript object, so that table may
   have a quoted `"customerId"` column. `02-rls.sql` detects which column exists instead
   of guessing, and reports it with `raise notice`.
3. **Turning on RLS breaks unauthenticated sync**, which the app does at start-up today.
   Flagged in the README as a decision, not silently changed.
4. Password reset needs real email addresses; the `@imode.local` convention cannot
   receive mail.
5. The audit trail is append-only through the API but editable by anyone with database
   access — an operational record, not evidence.


---

# STATE OF THE SYSTEM — 2026-09-10

**Read this before the change logs below.** Those logs stop at 2026-09-07 (part 4) and are
thirteen sessions behind. This section is the current picture; `CLAUDE.md` in the repo root
carries the full session-by-session history if you need the reasoning behind any of it.

## What exists now that the sections above do not mention

**Modules.** In addition to the list above: `my-work` (งานของฉัน, technicians only —
an Admin holds no `mywork.view` and `goPage('my-work')` bounces for them), `assign`
(มอบหมายงาน, needs `case.assign`), and `trash` (ถังขยะ, needs `settings.manage`).
`field-service` has a sidebar entry now. The sidebar is sorted into six named groups by
`js/36`; a page it does not list collects under อื่น ๆ rather than disappearing.

**Pages that are their own files.** `service-case-detail.html` is the full-page case
workspace, opened as `service-case-detail.html?caseId=<id>`. It is **read-only** — it reads
localStorage and never writes — and it has its own CSS, so `css/*` changes do not reach it.
`pages/customer-home.html` is the customer page.

**URL entry points.** The application has no router; `goPage()` only toggles `.page.active`
and the URL never changes. The only URLs that mean anything are `?machineToken=`,
`?serial=`, `#/customer-entry`, `#/customer-portal`, `?page=<module>` (20 internal pages,
whitelisted in `js/28`), plus `?openExternalBrowser=1` and `?scan=1` for the LINE path.

**Accounts are data, not code.** Seven staff accounts, defined in
`js/09` — but an admin can add, rename, re-password and delete any of them from
ตั้งค่าระบบ → การจัดการบัญชีผู้ใช้. Created accounts live in `settings.uatAccounts`;
changes to the seven built-ins live in `settings.uatAccountEdits`. `js/39` reimplements
`verify` and `findAccount` on `window.uatAuth` because **`js/09`'s own `findAccount()`,
`verify()` and `login()` call its private closure `allAccounts()`** — replacing only the
window view leaves an account visible in every list and still unable to sign in.

**A case can belong to several technicians.** `c.assignee` is still one id, the lead, and
fifteen places in `js/03` read it unchanged. `c.assignees` is the full list. On the wire it
travels inside the `assignee` column as `"T001,T-LEAD-RD"` because `service_cases` has no
column for it — two wrappers in `js/38` join and split; nothing else knows.

## Persistence — additions to the list above

`imode_v69_session`, `imode_v69_auth_audit`, `imode_v69_auth_lock`, `imode_v69_local_pw`,
`imode_v69_sb_auth` (the login system), `imode_v69_cloud_optout`, `imode_v69_home_usage`,
`imode_v70_trash_blob`.

Two things now live **inside `settings`** rather than in a key of their own, because they
have to reach every device: the login accounts and the recycle bin (`settings.trash`).
`mergeSettings()` spreads the saved object wholesale, so unknown top-level keys survive it.

`localStorage.clear()` is still forbidden.

## Supabase — additions to the list above

`qc_records`, `petty_cash`, `spare_parts`, `purchase_orders`, created 2026-09-10 by
`supabase/05-v70-operational-tables.sql` and already run. They are
**`{id, data jsonb, updated_at}` with the whole record in `data`**, unlike every other
table. That is deliberate: field-to-column mapping with a whitelist has twice meant a field
added in JavaScript was dropped silently. Do not normalise them into columns.

`notifications` is downloaded but never uploaded — there is no `cloudUpsertNotification`.
Addressed notices are derived from the case instead.

RLS is on but effectively open: `04-anon-uat.sql` and `05-v70-operational-tables.sql` grant
`anon` everything, and the publishable key ships in `js/23`. **This is a deliberate UAT
posture on a project named `service_Imode_test`, not an oversight.** Do not "fix" it without
asking; do not put real financial or personal records in it while it stands.

`settings.authConfig` currently carries `provider:'local'`, `sessionHours:24` and
`idleMinutes:1440`, set live and pushed to `system_settings`. The provider is pinned because
Supabase Auth only has users for three of the seven accounts, so the other four could not
sign in at all on a cloud-connected device. The `allowLocalFallback` switch that
`auth-integration.js` documents **was never implemented — it exists only in that comment.**

## Traps that have already cost this project real time

1. **`window.<name>` where `<name>` is a top-level `let` is always `undefined`.** It has
   broken four features. Most recently `checkSession()` read `window.currentUser`, so the
   session expiry it computes was never acted on — sessions never ended. Read and assign
   the bare identifier.
2. **`el.hidden = true` does nothing if an author rule gives the element a `display`.**
   Patched one element at a time three times before `css/23` closed it with
   `[hidden]{display:none!important}`. Do not add a fourth one-off.
3. **A script that pushes a key into `PERMISSION_CATALOG` must load before `js/20`**, which
   repairs roles against the catalog as it stands at that moment. A key registered after it
   is stripped from every role on every reload. `PAGE_PERMISSION` maps a page to an
   *existing* key and is safe to extend.
4. **`cloudUpsert*` sends an explicit whitelist.** A field you add in JavaScript is dropped
   silently on the way out and nobody notices until a second device is involved.
5. **`syncCloud()` replaces its arrays wholesale from the server.** Anything written locally
   and not yet pushed is destroyed. It also re-applies `mergeSettings()` over the settings
   object, which is why `js/29` re-runs the role migrations after every sync.
6. **An inline `style=` attribute beats every stylesheet.** The spare-parts toolbar had its
   grid inline, so that page had no responsive behaviour at all and no CSS file could have
   fixed it.
7. **`--window-size` is clamped to about 500px on Windows.** Set a headless viewport with
   `Emulation.setDeviceMetricsOverride`, or your "390px" run is really 500px.
8. **A parse error in a classic script is silent.** The only symptom is that the script's
   globals are missing. Load the file on its own with an `error` listener to find it.

## Known-benign noise

`sw.js` 404 on every boot (`js/03` registers a service worker that does not exist; the
registration is `.catch(()=>{})`). `POST /rest/v1/auth_audit` answers 401 on every sign-in
because `04-anon-uat.sql` covers the eleven data tables and not that one; the local audit
ring buffer is unaffected.
