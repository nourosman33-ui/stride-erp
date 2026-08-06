# STRIDE ERP — Delivery Roadmap

Companion to `SRS.md`, `Database.md`, `Architecture.md`. Phased so the business can retire the Excel workbook as early and safely as possible, rather than waiting for a "big bang" go-live. Each phase lists goals, in-scope SRS requirements, exit criteria, and what remains on the workbook until that phase ships.

No dates are committed here — durations are relative sizing (S/M/L) for planning purposes; the user/business should attach calendar dates once team size and start date are confirmed.

---

## Phase 0 — Foundations (S)

**Goal**: stand up the technical base so every later phase ships on solid ground; no end-user-visible features yet.

- Provision environments (dev/staging/prod), CI/CD pipeline, managed Postgres, object storage.
- Implement Identity & Access module (`user`, `role`, `user_role`) — FR-USR-1.
- Implement `store` configuration (FR-CFG-1) and global settings (currency, VAT rate) — FR-CFG-3.
- Implement Audit Log infrastructure (`audit_log` + service-layer interceptor) — FR-USR-2, NFR-2. Building this first means every subsequent module gets auditability for free instead of retrofitted.
- Set up automated backups (NFR-9).

**Exit criteria**: an admin can log in, configure the store profile, and every write from Phase 1 onward is audit-logged.

**Workbook status**: still fully in use; nothing migrated yet.

---

## Phase 1 — Catalog, Suppliers & Purchasing (M)

**Goal**: replace `Inventory Plan` and `Suppliers`, and fix the workbook's single biggest structural gap (per-size/color stock) before any inventory is entered.

- Category/Gender/Product Type/Size/Color lookup tables — FR-CAT-3.
- Product & Product Variant management (the size-range → per-size-variant fix) — FR-CAT-1/2/4.
- Price history — FR-CAT-5.
- Supplier directory & product-supplier linkage — FR-SUP-1/2.
- Purchase Order creation with line-level cost/margin calculation — FR-PUR-1/2.
- PO approval workflow — FR-PUR-4.
- Goods Receipt (full/partial) posting stock ledger entries — FR-PUR-3.
- Stock Ledger + derived stock-on-hand view — FR-INV-1.
- Supplier payables ledger — FR-SUP-3.

**Exit criteria**: the business can define its real product catalog with correct per-size stock, place and receive a purchase order, and see accurate on-hand inventory per variant per store — something the workbook could never do.

**Workbook status**: `Business Info`, `Startup Costs`, `Monthly Expenses` still used for planning; `Inventory Plan`/`Suppliers` retired in favor of STRIDE; `Inventory Tracker` retired (superseded by the live stock ledger).

**Migration task**: import populated `Suppliers` and `Inventory Plan` rows as seed data; each "Size Range" row must be split into explicit size variants during import (a guided step, not automatic, since it requires a real decision about which sizes exist).

---

## Phase 2 — Sales / POS & Customers (M–L)

**Goal**: replace `Sales Tracker` with a real point-of-sale that keeps inventory honest in real time — the second half of the workbook's core gap.

- POS PWA: barcode scan, multi-line invoice, discounts with approval limits — FR-SAL-1/2/4.
- Split payments — FR-SAL-3.
- Offline queueing & sync (per `Architecture.md` §5) — NFR-8.
- Automatic stock decrement on sale (same transaction as invoice) — FR-INV-2.
- Returns/exchanges/refunds — FR-SAL-5.
- Daily/monthly sales summaries — FR-SAL-6.
- Salesperson performance (linked to real users) — FR-SAL-7.
- Customer records & purchase history (CRM-lite) — FR-CRM-1/2.
- Movement status classification (Fast/Slow/Dead) computed from real sales, configurable thresholds — FR-INV-3.
- Low-stock / reorder alerts — FR-INV-8.

**Exit criteria**: every sale automatically and atomically updates inventory; the owner can trust stock counts on the floor without a manual reconciliation step. POS is usable during a brief internet outage without data loss.

**Workbook status**: `Sales Tracker` retired. `Product Dashboard`'s top/bottom-seller logic now runs off real transactions instead of manually typed "Sold Qty."

---

## Phase 3 — Expenses & Financial Reporting (M)

**Goal**: replace `Monthly Expenses`, `Expense Tracker`, `Break-Even`, `Cash Flow`, `P&L`, and `Final Summary` with live, plan-vs-actual reporting.

- Expense logging & category totals — FR-EXP-1/2/3.
- Budget-vs-actual (Monthly Expenses baseline vs. Expense Tracker actuals, finally reconciled) — FR-EXP-4.
- Expense approval workflow — FR-EXP-5.
- Startup cost budgeting (itemized, for capital planning even post-launch, e.g. a second store) — FR-FIN-1.
- Multi-scenario sales forecasting — FR-FIN-2.
- Break-Even, Cash Flow, and P&L computed in both **plan mode** (forecast-driven, matching the original workbook) and **actual mode** (transaction-driven, which the workbook structurally could not do) — FR-FIN-3/4/5.
- Investor/bank-ready Final Summary with automated warnings — FR-FIN-6/7.
- Weighted-average costing for accurate COGS — FR-INV-9.

**Exit criteria**: the owner can open one screen and see real cash position, real P&L, and real break-even progress — sourced from actual transactions, not static assumptions — while retaining the ability to re-run "what if" scenarios exactly as the workbook did.

**Workbook status**: financial sheets fully retired. This phase is the point at which STRIDE becomes strictly more trustworthy than the spreadsheet it replaces, since it can now show *actual* vs. *planned* side by side.

---

## Phase 4 — KPI Dashboards & Product Analytics (S)

**Goal**: replace `KPI Dashboard` and `Product Dashboard` with real-time, filterable views.

- KPI tile dashboard (revenue, profit, inventory value, opex, cash, margin, break-even, sales-to-date) — FR-KPI-1.
- Product performance (top/bottom sellers, margin leaders) with date-range filtering — FR-KPI-2.
- Monthly trend & expense-breakdown charts — FR-KPI-3.
- CSV/PDF export for investor/bank presentation — FR-KPI-4.

**Exit criteria**: dashboards load in real time (NFR-4) and can answer questions the static workbook couldn't (e.g., "top sellers this quarter" vs. all-time-only).

**Workbook status**: `KPI Dashboard` and `Product Dashboard` retired.

---

## Phase 5 — Planning Module (S)

**Goal**: carry over the strategic-planning sheets as living, collaborative records rather than static text — lowest priority since these are low-frequency, low-risk documents (no financial/inventory integrity at stake).

- Market Research register — FR-PLN-1.
- Risk Register with Likelihood×Impact scoring — FR-PLN-2.
- Marketing Plan with active-channel budget totals, reconciled against the Marketing expense category — FR-PLN-3.
- SWOT — FR-PLN-4.
- Action Plan / task tracker — FR-PLN-5.

**Exit criteria**: all 21 original workbook sheets have a STRIDE equivalent; the Excel file can be archived as historical record only.

**Workbook status**: fully retired.

---

## Phase 6 — Multi-Store & Scale-Out (M, triggered by business growth, not by calendar)

**Goal**: exercise the multi-store design that was built into the schema/architecture from Phase 0 onward, once the business actually opens a second location.

- Store-to-store stock transfers — FR-INV-6.
- Consolidated multi-store reporting and role scoping per store — FR-CFG-2, `user_role.store_id`.
- Scheduled/ad-hoc stock counts at scale — FR-INV-7.
- Revisit architecture for horizontal scaling if concurrent load requires it (per `Architecture.md` §8/§10).

**Exit criteria**: a second store can be onboarded as a data/configuration exercise, with no schema or service redesign — validating the NFR-5 design bet made in Phase 0.

---

## Explicitly deferred (re-evaluate after Phase 6)

Matches `SRS.md` §7 Out of Scope:

- Full double-entry general ledger / statutory accounting & tax filing integration.
- Payroll processing engine.
- E-commerce storefront / online ordering.
- Multi-currency support.
- Consignment inventory / drop-shipping.
- Loyalty/coupon engine beyond basic discounts (FR-CRM-3).

---

## Sequencing rationale

1. **Phases 1–2 first, deliberately**, because they fix the workbook's most operationally dangerous flaw — disconnected inventory and sales — before any other feature is layered on top of bad stock data.
2. **Phase 3 before Phase 4**, because dashboards are only as trustworthy as the transactions feeding them; shipping KPI screens before real sales/expense data exists would just recreate "pretty but manually-fed" reporting.
3. **Phase 5 is intentionally last** among the non-growth phases — it carries the least business risk (no money or stock depends on getting the SWOT sheet right) and can slip without blocking the business's ability to operate.
4. **Phase 6 is growth-triggered, not date-triggered** — building multi-store support before there is a second store would be speculative work; the architecture (store_id everywhere) is designed in from Phase 0 specifically so this phase is additive, not a rewrite.
