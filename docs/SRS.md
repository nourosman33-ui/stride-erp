# STRIDE ERP — Software Requirements Specification

| | |
|---|---|
| **Product** | STRIDE ERP |
| **Domain** | Shoe Retail (single store today, multi-branch by design) |
| **Source model** | `Shoe Store Feasibility Model - El Warraq.xlsx` (21 sheets, fully parsed) |
| **Status** | Draft v1.0 — for approval before any implementation begins |
| **Author** | CTO / Lead Architect (AI-assisted) |

---

## 1. Introduction

### 1.1 Purpose

This SRS defines what STRIDE ERP must do to run a shoe retail business end-to-end — from purchasing and inventory through point-of-sale, expenses, and financial/KPI reporting. It formalizes the business logic currently trapped in a single Excel workbook, closes the operational gaps that a spreadsheet cannot solve, and gives every other project document (`Database.md`, `Architecture.md`, `Roadmap.md`) a shared, traceable source of truth.

### 1.2 Scope

STRIDE ERP replaces the workbook's role as the "single source of truth" for:

- Store & business configuration
- Product catalog, suppliers, and purchasing
- Inventory (multi-location, per-variant stock ledger)
- Sales / POS and customer management
- Expenses and cash/financial reporting (P&L, cash flow, break-even)
- KPI dashboards (real-time, not manually refreshed formulas)
- Light business-planning tools (marketing budget, risk register, action plan) carried over from the workbook, reworked as living, collaborative records instead of static sheets

Out of scope for v1 (see `Roadmap.md` for phasing): full double-entry general ledger/accounting suite, payroll/HR beyond a salary expense line, e-commerce storefront, and multi-currency operations.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| SKU / Variant | A single sellable unit: one Product × one Size × one Color. The workbook only tracks a "Size Range" (e.g. 40–45) per model — STRIDE tracks stock per individual size. |
| Stock Ledger | An append-only log of every inventory-affecting event (receipt, sale, adjustment, transfer, return). Stock-on-hand is a derived value, never a hand-edited number. |
| Movement Status | Fast Moving / Slow Moving / Dead Stock classification, carried over from the workbook's `Inventory Tracker` thresholds (≥70% sold = Fast, ≤10% sold = Dead). |
| Expected Scenario | The middle of three sales forecast scenarios (Conservative / Expected / Optimistic) from `Sales Forecast`; drives Break-Even, Cash Flow, P&L, and Final Summary in the source model. |
| GRN | Goods Receipt Note — the event that converts an ordered PO line into on-hand stock. |

### 1.4 Traceability to the source workbook

| Workbook sheet | STRIDE module |
|---|---|
| Contents | — (documentation only) |
| Business Info | Store Configuration |
| Startup Costs | Capital Budgeting (Planning module) |
| Monthly Expenses | Expense Management (budget baseline) |
| Inventory Plan | Purchasing (initial PO) + Product Catalog |
| Suppliers | Supplier Management |
| Sales Forecast | Financial Planning (scenario forecasting) |
| Break-Even | Financial Reporting |
| Cash Flow | Financial Reporting |
| P&L | Financial Reporting |
| Inventory Tracker | Inventory Management (live stock ledger) |
| Product Dashboard | Reporting & KPIs |
| Expense Tracker | Expense Management (actuals) |
| Sales Tracker | Sales / POS (transaction log) |
| KPI Dashboard | Reporting & KPIs |
| Market Research | Planning module |
| Risk Analysis | Planning module (risk register) |
| Marketing Plan | Planning module (marketing budget) |
| SWOT | Planning module |
| Action Plan | Planning module (task tracker) |
| Final Summary | Reporting & KPIs (executive snapshot) |

---

## 2. Overall Description

### 2.1 Business context (derived from the workbook)

- Single physical store, ~60 sqm, 6m frontage, value-for-money family footwear, targeting middle-income families in El Warraq / Greater Giza.
- Products are sourced from Egyptian shoe factories/suppliers as cartons of mixed sizes, priced by cost and marked up to a selling price per model (not per size).
- The business plans against three demand scenarios and tracks a 12-month cash runway from a combined startup + inventory capital base.
- Day-to-day operations are meant to be logged into "Tracker" sheets (inventory, expenses, sales) that were designed to keep the static financial model "live," but in the workbook these logs are **manually maintained and disconnected from each other** — a sale entered in Sales Tracker does not touch Inventory Tracker's stock count.
- The business explicitly plans to grow (Action Plan includes "Grand opening event"; Final Summary computes ROI and break-even month for investor/bank presentation) — the architecture must not assume "one store forever."

### 2.2 User roles

| Role | Description | Primary modules |
|---|---|---|
| Owner / Admin | Full access; configures store, approves budgets, views all financials | All |
| Store Manager | Runs daily operations, approves POs and discounts within limits, manages staff | Purchasing, Inventory, Sales, Expenses, Reporting |
| Cashier / Sales Associate | Processes sales at POS, looks up stock, records customer info | Sales/POS, Inventory (read) |
| Inventory Clerk | Receives goods, performs stock counts/adjustments, manages transfers | Inventory, Purchasing (receiving) |
| Accountant / Bookkeeper | Logs expenses, reconciles cash, reviews P&L/cash flow | Expenses, Reporting |
| Read-only / Investor viewer | Views the Final Summary / KPI dashboard only | Reporting (restricted) |

Roles are configurable (RBAC), not hardcoded — a single-owner-operated store must be able to collapse all roles into one user on day one.

### 2.3 Assumptions & constraints

- Currency: Egyptian Pound (EGP) as the only currency for v1; the data model must not preclude adding currencies later.
- Egypt applies 14% VAT; the workbook's "Taxes" line is a flat monthly guess — STRIDE must support real transaction-level tax calculation even though the source model didn't.
- Store operates offline-capable POS (retail floor connectivity in Egypt cannot be assumed reliable) — see NFR-8.
- Initial deployment targets one store; the schema and services must support N stores/warehouses without redesign (the business already frames this as an investment case with growth expectations).

---

## 3. Functional Requirements

Each requirement is tagged `FR-<module>-<n>`. "Workbook gap" call-outs mark logic that STRIDE must add beyond what the spreadsheet did.

### 3.1 Store & Business Configuration

- **FR-CFG-1**: System shall store one or more Store profiles: name, location/address, size (sqm), frontage, opening date, concept/positioning notes, target market description. *(from Business Info)*
- **FR-CFG-2**: System shall support multiple stores/warehouses under one business account, each with its own inventory, staff, and sales, rolling up to consolidated reporting. **[Workbook gap: model assumes exactly one store.]**
- **FR-CFG-3**: System shall maintain global settings: currency (EGP default), VAT rate, fiscal year start, default markup rules.

### 3.2 Product Catalog

- **FR-CAT-1**: System shall manage Products with: name/model, category (e.g., Casual, Sport, Formal), gender (Men/Women/Kids/Unisex), product type (Sneaker, Sandal, Boot, etc.), brand/factory, base cost price, base selling price, barcode, images, notes.
- **FR-CAT-2**: System shall manage Product **Variants** as the sellable unit: each variant = Product × Size × Color, each with its own barcode/SKU, its own on-hand stock, and (optionally) its own price override. **[Workbook gap: `Inventory Plan`/`Inventory Tracker` only store a "Size Range" string like "40-45" and one aggregate quantity — operationally you cannot tell if size 41 is out of stock while size 44 is overstocked. This is the single highest-priority fix.]**
- **FR-CAT-3**: Category, Gender, and Product Type shall be managed as controlled lookup lists, not free text, to keep dashboards and filters consistent. **[Workbook gap: these were free-text columns, prone to inconsistent spelling across sheets.]**
- **FR-CAT-4**: System shall auto-generate a barcode when one is not supplied, and enforce barcode uniqueness. **[Workbook gap: barcode was a manually typed number with no uniqueness check.]**
- **FR-CAT-5**: System shall support price change history per product/variant (effective date, old price, new price, reason) rather than overwriting a single cell. **[Workbook gap: cost/selling price were single mutable cells with no history.]**

### 3.3 Supplier Management

- **FR-SUP-1**: System shall maintain a Supplier directory: name, factory (may differ from supplier/agent), address, phone, WhatsApp, social contact, minimum order (in cartons or EGP), payment terms, average delivery lead time, quality rating (1–5), notes. *(from Suppliers)*
- **FR-SUP-2**: System shall link every Product/Variant to one or more preferred suppliers with supplier-specific cost price.
- **FR-SUP-3**: System shall track outstanding payables per supplier (amount owed, deposits paid, balance due on delivery). **[Workbook gap: "50% deposit / 50% on delivery" was a free-text note with no ledger behind it.]**

### 3.4 Purchasing

- **FR-PUR-1**: System shall support creating Purchase Orders against a supplier, with lines per product/variant: quantity (in pieces and/or cartons × pieces-per-carton), cost price, expected delivery date.
- **FR-PUR-2**: System shall compute PO totals and expected margin automatically (cost × qty, expected profit = (sell − cost) × qty), mirroring `Inventory Plan`'s formulas but as a reusable calculation, not a static one-time sheet.
- **FR-PUR-3**: System shall support a Goods Receipt workflow: receiving a PO (in full or partial) creates stock-ledger entries and updates on-hand quantity; discrepancies (short-shipped, damaged) must be recorded against the PO. **[Workbook gap: no receiving step exists — `Inventory Plan` quantities were assumed to become stock instantly and completely.]**
- **FR-PUR-4**: System shall support PO approval limits (e.g., POs above a configurable EGP threshold require Owner/Manager approval). **[Workbook gap: no approval concept anywhere.]**
- **FR-PUR-5**: System shall support returns-to-supplier (defective/wrong stock) as a distinct transaction type affecting both inventory and payables.

### 3.5 Inventory Management

- **FR-INV-1**: System shall maintain stock-on-hand per Variant per Store/Warehouse, computed from an append-only Stock Ledger (receipts, sales, adjustments, transfers, returns) — never a manually edited counter. **[Workbook gap: `Inventory Tracker`'s "Current Stock" and "Sold Qty" were both manually typed numbers with no underlying transaction history and no link to actual sales.]**
- **FR-INV-2**: Every Sale transaction shall automatically decrement stock for the sold variant in real time. **[Workbook gap: `Sales Tracker` and `Inventory Tracker` are entirely disconnected sheets in the source model — this is the most operationally dangerous gap and must be fixed.]**
- **FR-INV-3**: System shall classify each variant/product as Fast Moving (≥70% of stock sold), Dead Stock (≤10% sold), or Slow Moving (between), matching the workbook's thresholds, with the thresholds stored as configurable parameters, not hardcoded.
- **FR-INV-4**: System shall compute total inventory value (sum of on-hand qty × cost price) in real time, matching `Inventory Tracker`'s `TOTAL REMAINING INVENTORY VALUE`.
- **FR-INV-5**: System shall support manual stock adjustments (damage, loss, theft, found stock) with a mandatory reason code, visible in the stock ledger. **[Workbook gap: no adjustment/write-off concept existed.]**
- **FR-INV-6**: System shall support stock transfers between stores/warehouses once multi-store is enabled.
- **FR-INV-7**: System shall support scheduled/ad-hoc stock counts (cycle counts) that reconcile counted vs. system quantity and post the variance as an adjustment. **[Workbook gap: no stock-take process existed.]**
- **FR-INV-8**: System shall generate low-stock / reorder alerts per variant based on a configurable reorder point and supplier lead time. **[Workbook gap: Movement Status was descriptive/retrospective only — nothing proactively told the owner to reorder.]**
- **FR-INV-9**: System shall compute per-unit cost using a defined costing method (weighted average recommended) rather than a single flat "average cost price" assumption used across all units. **[Workbook gap: Sales Forecast used one flat average cost price per scenario, not actual per-unit cost.]**

### 3.6 Sales / Point of Sale

- **FR-SAL-1**: System shall record each sale as a transaction: date/time, invoice number (system-generated, sequential, unique), store, cashier/salesperson (linked to a user, not free text), one or more line items (variant, quantity, unit price, discount), payment method(s), customer (optional).
- **FR-SAL-2**: System shall compute net price per line (`selling price − discount`) and invoice totals automatically, matching `Sales Tracker`'s logic, extended to multi-line invoices (the workbook only supported one product per row/invoice implicitly).
- **FR-SAL-3**: System shall support split/multiple payment methods per invoice (cash + card, etc.) with amounts reconciling to the invoice total. **[Workbook gap: single "Payment Method" text field per row.]**
- **FR-SAL-4**: System shall support discounts at line level and invoice level, with discount-approval limits by role. **[Workbook gap: discount was an unrestricted numeric field.]**
- **FR-SAL-5**: System shall support returns/exchanges/refunds linked to the original invoice, reversing the stock and revenue impact appropriately. **[Workbook gap: no returns concept existed anywhere in the model.]**
- **FR-SAL-6**: System shall compute daily/monthly sales summaries (transaction count, net sales, average sale value) in real time, matching `Sales Tracker`'s summary block.
- **FR-SAL-7**: System shall support salesperson performance tracking (units sold, revenue, commission if configured) since "Salesperson" becomes a real user reference, not free text.
- **FR-SAL-8**: System shall be usable at a physical POS terminal with barcode scanner input and must remain operable during short connectivity outages (see NFR-8).

### 3.7 Customer Management (CRM-lite)

- **FR-CRM-1**: System shall maintain a Customer record (name, phone, notes) reusable across visits, replacing the workbook's free-text "Customer" field and default "Walk-in Customer." **[Workbook gap: no persistent customer entity — no repeat-customer visibility.]**
- **FR-CRM-2**: System shall show purchase history per customer.
- **FR-CRM-3**: System shall support an opt-in loyalty/discount mechanism (phase 2+), out of v1 scope but must not be precluded by the data model.

### 3.8 Expense Management

- **FR-EXP-1**: System shall support a configurable list of expense categories (Rent, Salaries, Electricity, Water, Internet, Cleaning, Packaging, Transportation, Maintenance, Taxes, Marketing, Unexpected, Other, extensible) seeded from `Monthly Expenses`/`Expense Tracker`.
- **FR-EXP-2**: System shall let users log actual expenses (date, category, amount, payment method, supplier/payee, notes), matching `Expense Tracker`.
- **FR-EXP-3**: System shall compute category totals and grand total automatically (equivalent to the `SUMIF` logic) for any selected date range, not just an unbounded running log.
- **FR-EXP-4**: System shall support recurring expense templates (e.g., monthly rent) that generate expected-vs-actual comparisons against the `Monthly Expenses` budget baseline. **[Workbook gap: budget (`Monthly Expenses`) and actuals (`Expense Tracker`) were two unlinked sheets with no variance view.]**
- **FR-EXP-5**: System shall support an expense approval workflow above a configurable threshold. **[Workbook gap: none existed.]**

### 3.9 Financial Planning & Reporting

- **FR-FIN-1**: System shall support Startup Cost budgeting as an itemized, categorized list with automatic total, matching `Startup Costs`.
- **FR-FIN-2**: System shall support multi-scenario Sales Forecasting (Conservative/Expected/Optimistic, or user-defined scenarios) computing weekly/monthly units, revenue, COGS, gross profit, and gross margin %, matching `Sales Forecast`'s formulas.
- **FR-FIN-3**: System shall compute Break-Even analysis (contribution margin, break-even units/revenue, monthly/daily break-even, profit-after-break-even) from live Monthly Expenses + a selected forecast scenario, matching `Break-Even`.
- **FR-FIN-4**: System shall compute a 12-month (rolling, configurable horizon) Cash Flow projection: opening cash, sales, operating expenses, inventory purchases, net cash flow, closing cash — carrying forward month to month, matching `Cash Flow`.
- **FR-FIN-5**: System shall compute a monthly & annual P&L (Revenue, COGS, Gross Profit, Operating Expenses, Net Profit), matching `P&L`, and — unlike the source model — must be able to run this off **actual** transactions (Sales + Expense logs) as well as forecast assumptions, so the business can compare plan vs. actual.
- **FR-FIN-6**: System shall compute investor-facing summary metrics: Total Startup Investment, Working Capital (N months of opex, configurable — workbook used 3), Total Capital Required, Expected Monthly/Annual Net Profit, Year-1 ROI, Break-Even Month estimate, and automated positive/negative warnings, matching `Final Summary`.
- **FR-FIN-7**: System shall flag (in-app, not just a text warning) when projected profit is negative or projected cash goes negative within the forecast horizon, matching the automated warning logic in `Final Summary`.

### 3.10 KPI & Reporting Dashboards

- **FR-KPI-1**: System shall provide a real-time dashboard of: Expected/Actual Monthly Revenue, Gross Profit, Net Profit, Current Inventory Value, Monthly Operating Expenses, Closing Cash, Average Gross Margin %, Break-Even Units/Month, Actual Sales-to-Date — matching `KPI Dashboard` tiles, but live rather than formula-refreshed.
- **FR-KPI-2**: System shall provide a Product Performance view: Top 5 / Bottom 5 sellers by units, and margin leaders by EGP margin per unit, matching `Product Dashboard`, computed over a selectable date range (the workbook had no date filter — it was all-time only).
- **FR-KPI-3**: System shall provide a monthly trend view (revenue, expenses, profit over time) and expense-breakdown chart, matching the `KPI Dashboard`'s chart placeholders.
- **FR-KPI-4**: All dashboard values shall be exportable (CSV/PDF) for investor/bank presentation, matching the intent of `Final Summary`.

### 3.11 Planning Module (carried over, lightweight)

- **FR-PLN-1**: System shall support a Market Research register (competitor name, location, size, strengths/weaknesses, price range, best sellers, brands, target customers, notes), matching `Market Research`.
- **FR-PLN-2**: System shall support a Risk Register with Likelihood × Impact scoring (Low/Medium/High → 1–3 scale, score = product) and mitigation plans, matching `Risk Analysis`, with configurable thresholds for the color-coded priority bands (6–9 high, 3–4 medium, 1–2 low).
- **FR-PLN-3**: System shall support a Marketing Plan: channel, active flag, monthly budget, frequency/plan, notes, with automatic sum of active-channel budgets, matching `Marketing Plan`, and this total should be reconcilable against the "Marketing" Expense category (FR-EXP-4).
- **FR-PLN-4**: System shall support a SWOT record (free-text Strengths/Weaknesses/Opportunities/Threats).
- **FR-PLN-5**: System shall support an Action Plan / task tracker (task, responsible person, budget, priority, deadline, status) with automatic budget total, matching `Action Plan`.

### 3.12 User & Access Management

- **FR-USR-1**: System shall support user accounts with role-based access control per the roles in §2.2, configurable per store.
- **FR-USR-2**: System shall log an audit trail of who created/edited/deleted key records (prices, stock adjustments, expense entries, PO approvals, discounts) with timestamp and before/after values. **[Workbook gap: no audit trail — anyone with the file could silently overwrite any cell.]**

---

## 4. Non-Functional Requirements

- **NFR-1 (Data integrity)**: Inventory quantities must never be directly editable outside the stock ledger; all stock changes flow through typed transactions (receipt, sale, adjustment, transfer, return, count).
- **NFR-2 (Auditability)**: Every financial and inventory-affecting record must be attributable to a user and timestamp, and immutable once posted (corrections happen via a new offsetting transaction, not an edit).
- **NFR-3 (Consistency)**: Category/Gender/Product Type/Expense Category values must be enforced via lookups, not free text, so reports never silently drop mis-typed rows (a real risk observed throughout the workbook).
- **NFR-4 (Performance)**: POS sale completion (scan → payment → receipt) shall complete in under 2 seconds under normal load; dashboards shall load in under 3 seconds for a single-store dataset.
- **NFR-5 (Scalability)**: The data model and services must support growth from 1 store to a multi-store chain without a schema rewrite.
- **NFR-6 (Security)**: Role-based access control, encrypted credentials, encrypted data at rest and in transit, principle of least privilege for financial data (e.g., cashiers cannot see cost prices/margins by default).
- **NFR-7 (Localization)**: EGP currency formatting by default; UI text architecture must support Arabic/English bilingual display (Egypt market) even if only English ships in v1.
- **NFR-8 (Offline resilience)**: POS must tolerate short internet outages, queuing transactions locally and syncing once connectivity returns, without double-counting stock or sales.
- **NFR-9 (Backup & recovery)**: Daily automated backups with a defined RPO/RTO; the business must never again be exposed to "one Excel file = entire company record" risk.
- **NFR-10 (Usability)**: Non-technical retail staff (matching the profile implied by the workbook: an owner-operator business) must be able to complete a sale and receive stock without training beyond a short onboarding walkthrough.

---

## 5. Business Rules (formalized)

Derived directly from workbook formulas, made explicit and configurable:

1. **Expected Profit** = Selling Price − Cost Price (per unit).
2. **Total Cost (PO line)** = Cost Price × Quantity.
3. **Movement Status**: Fast Moving if `Sold Qty ≥ 0.7 × Stock Received`; Dead Stock if `Sold Qty ≤ 0.1 × Stock Received`; otherwise Slow Moving. Thresholds configurable per business.
4. **Contribution Margin** = Avg. Selling Price − Avg. Cost Price.
5. **Monthly Break-Even Units** = Fixed Monthly Costs ÷ Contribution Margin per Unit.
6. **Gross Margin %** = Gross Profit ÷ Revenue (0 if Revenue = 0).
7. **Net Cash Flow (month)** = Sales − Operating Expenses − Inventory Purchases; **Closing Cash** = Opening Cash + Net Cash Flow; next month's Opening Cash = prior month's Closing Cash.
8. **Total Capital Required** = Total Startup Investment (Startup Costs + Initial Inventory) + Working Capital (default 3 × Monthly Operating Expenses, configurable).
9. **Year-1 ROI** = Annual Net Profit ÷ Total Capital Required.
10. **Risk Score** = Likelihood (Low=1/Medium=2/High=3) × Impact (Low=1/Medium=2/High=3); priority bands: 6–9 High, 3–4 Medium, 1–2 Low.
11. **Negative-profit / negative-cash warnings** must trigger automatically wherever Net Profit < 0 or any projected Closing Cash < 0 within the forecast horizon.
12. **Net Sale Price (line)** = Selling Price − Discount.

---

## 6. Data Migration Requirements

- STRIDE shall provide an import path for the existing workbook's populated sheets (`Business Info`, `Startup Costs`, `Monthly Expenses`, `Inventory Plan`, `Suppliers`, `Sales Forecast` at minimum) so the current feasibility model becomes the seed data for the new system rather than being discarded.
- Import must map the workbook's flat "Size Range" text per Inventory Plan row into an explicit prompt to define individual size variants before stock can be received against it (since this is a required structural change, not a like-for-like field mapping).

## 7. Out of Scope (v1)

- Full double-entry general ledger / statutory accounting and tax filing integration.
- Payroll processing (salaries remain a single expense line as in the workbook, not a payroll engine).
- E-commerce storefront / online ordering.
- Multi-currency and cross-border operations.
- Consignment inventory and drop-shipping.

See `Roadmap.md` for when deferred items may be reconsidered.
