# STRIDE ERP — Backend (Phase 0 + Phase 1)

NestJS + TypeScript modular monolith on PostgreSQL (via Prisma). Implements the foundations
(`docs/Roadmap.md` Phase 0) and Catalog/Suppliers/Purchasing/Inventory (Phase 1). See
`../docs/Architecture.md` for the module map and `../docs/Database.md` for the schema this
mirrors.

## Prerequisites

- Node.js 20+ (built and tested against Node 24)
- Docker Desktop (for local Postgres/Redis via `docker-compose.yml`) — **not available in the
  sandbox this was built in**, so migrations have not been run against a live database yet. Run
  them on your machine per the steps below.
- Git — likewise not present in the build sandbox; this folder is not yet a git repo. Run
  `git init` at the project root (or wherever you want the repo rooted) when ready.

## Setup

```powershell
cd backend
npm install
copy .env.example .env        # edit secrets as needed
docker compose up -d          # starts Postgres 16 + Redis locally
npx prisma migrate dev --name init   # creates the schema in Postgres
npm run prisma:seed           # seeds roles, an owner user, and base catalog lookups
npm run start:dev
```

The seed script prints a generated owner login (default `owner@stride-erp.local` /
`ChangeMe123!` unless `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` are set) — **change that
password immediately** via a real user-management flow before this goes anywhere near
production.

## What's implemented

| Module | Covers |
|---|---|
| `modules/identity` | Login (JWT access + refresh), user creation, RBAC roles/guards |
| `modules/store` | Store profile & settings (currency, VAT rate, PO approval threshold) |
| `common/audit` | `AuditService.record()` — called explicitly from every mutation on price, stock, PO approval, and store settings |
| `modules/catalog` | Category/Gender/ProductType/Size/Color lookups, Products, **per-size/color Product Variants** (the workbook's biggest gap — see `docs/SRS.md` FR-CAT-2), price history |
| `modules/suppliers` | Supplier directory, product-supplier linkage, a running supplier payment ledger |
| `modules/purchasing` | Purchase Orders with computed line totals/expected profit, an approval workflow gated on the store's threshold, Goods Receipt (posts to the stock ledger), Purchase Returns |
| `modules/inventory` | The append-only stock ledger — the **only** write path for stock changes anywhere in the codebase — plus derived stock-on-hand, weighted-average costing, Fast/Slow/Dead movement classification, and reorder alerts |

Sales/POS, Expenses, Financial Reporting, KPI Dashboards, and the Planning module are Phase 2+
per `docs/Roadmap.md` and are not implemented here yet.

## Key design choices worth knowing before extending this

- **Stock is never a mutable column.** `InventoryService.postStockMovement()` is the only method
  in the codebase allowed to write `stock_ledger_entry` rows; stock-on-hand is always
  `SUM(quantity_delta)`. `PurchasingService` calls into `InventoryService` rather than writing to
  the ledger itself — keep that boundary when Sales/POS lands in Phase 2, or the workbook's
  original Sales-Tracker/Inventory-Tracker disconnect comes back.
- **Money fields computed in the service layer, not the database.** Prisma has no portable
  generated-column feature, so `line_total` / `expected_profit` on PO lines are computed in
  `PurchasingService.createPurchaseOrder()` and persisted, not database-generated as
  `docs/Database.md` describes in the abstract — noted at the top of `prisma/schema.prisma`.
- **Audit logging is explicit, not interceptor-magic.** `AuditService.record()` is called by hand
  at each mutation site so before/after payloads are meaningful per entity, instead of dumping
  raw request bodies from a generic interceptor.
- **RBAC role checks are currently global, not store-scoped**, even though `UserRole.storeId`
  already carries per-store scope in the schema. Enforcing that scope per-request is deferred to
  Roadmap Phase 6 (multi-store) — noted in `common/guards/roles.guard.ts`.

## Testing

```powershell
npm test
```

18 unit tests cover the guardrails that matter most: `RolesGuard`'s allow/deny logic,
`InventoryService`'s validation (rejecting zero-quantity and reason-less adjustment entries) and
Fast/Slow/Dead movement classification, and `PurchasingService`'s line-total/expected-profit math
and approval-threshold branching. These run against mocked Prisma clients and need no database.

You may see a Jest warning about a worker process not exiting gracefully — this is a known,
benign interaction between Jest and the generated Prisma client module load, not a test failure.

End-to-end tests against a real Postgres instance are not included yet; add them once Docker is
available in your environment (they were out of reach in the sandbox this was built in).

## Type/build validation performed in the build sandbox

- `npx prisma validate` — schema is valid.
- `npm run build` (`nest build`, backed by `tsc`) — compiles cleanly, 51 output files.
- `npx tsc --noEmit` — no type errors.
- `npm test` — 18/18 passing.

Not yet performed (needs Docker/Postgres on your machine): `prisma migrate dev` against a live
database, and a manual smoke test of the running API (login → create store → create product →
add variant → create PO → approve → receive goods → confirm stock-on-hand).
