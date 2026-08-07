import type { Role } from "./api/types";

const ELEVATED_ROLES: Role[] = ["owner", "manager", "inventory_clerk", "accountant"];

/** A user whose only role is cashier — no back-office access at all (see nav-items.ts). */
export function isCashierOnly(roles: Role[]): boolean {
  return roles.includes("cashier") && !roles.some((r) => ELEVATED_ROLES.includes(r));
}

const CASHIER_ALLOWED_PATH_PREFIXES = ["/pos"];

/** Enforced in (app)/layout.tsx so direct URL entry is blocked, not just hidden nav links. */
export function isPathAllowedForCashier(pathname: string): boolean {
  return CASHIER_ALLOWED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
