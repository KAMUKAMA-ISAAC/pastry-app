# PASTRY QUIN — Studio Administration System

## Original Problem Statement
Build a complete, production-quality, ADMIN-ONLY web application for the cake business **PASTRY QUIN** (exact spelling everywhere). Internal management of clients, cake orders, payments, cake designs, reminders, schedules and business information. NOT customer-facing. Boutique patisserie editorial design (vanilla cream, dusty rose, caramel, pistachio, cocoa; Cormorant Garamond + Plus Jakarta Sans). No ingredient inventory, no marketplace, no generic SaaS dashboard look.

## User Choices
- Email reminders: managed Resend integration (no user key needed)
- Image storage: Emergent object storage
- Auth: JWT email/password with seeded owner account (quinpastry@gmail.com)
- Receipts: view + print + PDF download + email
- No demo data — system starts empty (catalog defaults only)
- Wedding & Introduction cake orders strictly separated from Normal (small cakes)

## Architecture
- **Backend:** FastAPI + Postgres (asyncpg, via pgdb.py's Mongo-shaped document-store shim), modular routers: auth.py, routes_clients.py, routes_orders.py, routes_payments.py, routes_catalog.py, routes_misc.py, reminders.py, emailer.py (Resend proxy + anti-phishing guardrails), storage.py (Emergent object storage), db.py (helpers, audit, notifications)
- **Frontend:** React + Tailwind + shadcn/Radix + recharts + date-fns; pages under /app/frontend/src/pages, layout in components/layout/AppLayout.js
- **Cron:** .emergent/crons.yml — daily 06:00 UTC POST /api/cron/send-reminders (WEBHOOK_CRON_SECRET auth)
- **Order numbers:** PQ-YYYY-NNNN via atomic counters; receipts PQ-R-YYYY-NNNN

## User Personas
- Owner/Admin (seeded): full access, staff management
- Staff (future roles OWNER/ADMIN/STAFF foundation in place)

## Implemented (2026-09-09)
- JWT auth: login/logout/me/refresh, forgot/reset password (hashed tokens, throttling, brute-force lockout), change password, staff creation (owner/admin only)
- Dashboard: 8 KPIs, quick actions, upcoming cakes with thumbnails + urgency pills
- Clients: CRUD, search, new/returning filters, archive/restore, permanent delete (blocked when orders exist), full profile with preferences + order history
- Orders: full CRUD, category separation (Wedding & Introduction vs Normal), manual pricing, auto balance, statuses, filters, pagination, archive/restore, permanent delete (cascades payments/receipts/images/reminders)
- Final Confirmed Cake Design: upload/replace/delete/fullscreen, clearly separated from Reference/Inspiration images (object storage)
- Payments: multiple per order, methods, references, auto payment status, history, auto receipt generation
- Receipts: branded view, print CSS, PDF download (reportlab), email to client
- Email reminders: deposit due / 7-day / 3-day / day-of, scheduled on order create, tracked statuses, daily cron sends + internal notifications
- Calendar: month/week/day views, category filter, status color dots
- Cake Designs gallery: confirmed designs with category/type/flavor filters
- Catalog: flavors, cake types, sizes, design categories CRUD with active/inactive
- Feedback: record with rating/went-well/improve/follow-up, archive
- Reports: revenue/orders charts, flavor & design popularity, client & feedback stats, CSV exports (clients/orders/payments)
- Notifications center, audit log, global search, settings (business, logo upload, email info, admin password, staff)

## Test Status
- iteration_1 (2026-09-09): all 7 reported-issue scenarios pass (login, order create, final design upload, payment + balance, delete order, delete client, delete protection). 100% frontend, 100% backend for scope.

## Backlog
- P1: Replace window.confirm with Radix AlertDialog for deletes
- P1: Order summary print-friendly page (order sheet for kitchen)
- P2: Image thumbnail optimization (resize on upload)
- P2: Role-based permission enforcement beyond staff creation (UI gating)
- P2: Email reply-to setting UI
- P3: Client-facing PDF order summary export
