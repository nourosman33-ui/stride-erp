/** Manager/owner have self-authority over expenses (auto-approve, full read scope);
 * cashier is scoped to their own rows for today only. Shared by ExpensesService and
 * ExpenseAnalyticsService so the two never drift on what "elevated" means. */
export function isElevated(roles: string[]): boolean {
  return roles.includes("owner") || roles.includes("manager");
}
