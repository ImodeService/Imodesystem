# I-MODE System — notes for coding agents

This folder is the new main codebase (created 2026-10-12). Read README.md first.

- The old app `G:\ImodeService-main` is still live and is the reference for business rules
  (its CLAUDE.md documents workflows, statuses and modules). Do not edit it from here.
- One Supabase project, one login for every module. Permissions = department + level +
  enabled modules, enforced by Supabase RLS, never only by hiding UI.
- Customer pages (imodeservice.com) stay separate from staff pages (app.imodeservice.com).
- Brand: logo in assets/brand/. UI follows Odoo's patterns (app grid launcher, list/kanban/form
  views, status bar, smart buttons, chatter) in I-MODE navy/orange.
- No real customer data or secrets in this folder.
- Users write Thai; UI text is Thai first.
