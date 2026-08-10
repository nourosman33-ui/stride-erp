import { ExpenseQuickPeriod } from "./dto/list-expenses-query.dto";

/** Mirrors FinanceService's own startOfDay/addDays/weekStart conventions exactly,
 * so a "today"/"week"/"month"/"year" window here always lines up with the same
 * calendar buckets FinanceService's getPnl/getDailySeries already use. */

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Local calendar date as YYYY-MM-DD — see FinanceService.isoDate for why this
 * must NOT be `d.toISOString().slice(0,10)` (that round-trips through UTC and
 * shifts the label back a day for any positive-offset timezone). */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface DateWindow {
  from: Date;
  to: Date;
}

/** Sunday-start week, matching FinanceService.getOverview's `addDays(today, -today.getDay())`. */
export function weekWindow(now = new Date()): DateWindow {
  const today = startOfDay(now);
  const from = addDays(today, -today.getDay());
  return { from, to: addDays(today, 1) };
}

export function monthWindow(now = new Date()): DateWindow {
  const today = startOfDay(now);
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: addDays(today, 1) };
}

export function yearWindow(now = new Date()): DateWindow {
  const today = startOfDay(now);
  return { from: new Date(now.getFullYear(), 0, 1), to: addDays(today, 1) };
}

export function dayWindow(now = new Date()): DateWindow {
  const today = startOfDay(now);
  return { from: today, to: addDays(today, 1) };
}

export function quickPeriodWindow(period: ExpenseQuickPeriod, now = new Date()): DateWindow {
  switch (period) {
    case "today":
      return dayWindow(now);
    case "week":
      return weekWindow(now);
    case "month":
      return monthWindow(now);
    case "year":
      return yearWindow(now);
  }
}

/** Resolves a list/report request's window: explicit from/to wins, then a quick-pick
 * period key, defaulting to "today" so an unfiltered request never returns everything. */
export function resolveWindow(input: { period?: ExpenseQuickPeriod; from?: string; to?: string }): DateWindow {
  if (input.from || input.to) {
    const to = input.to ? addDays(startOfDay(new Date(input.to)), 1) : addDays(startOfDay(), 1);
    const from = input.from ? startOfDay(new Date(input.from)) : addDays(to, -30);
    return { from, to };
  }
  return quickPeriodWindow(input.period ?? "today", new Date());
}

// -------------------------------------------------- chart-series bucket keys

/** Sunday-start-of-week for an arbitrary date, as a YYYY-MM-DD label. */
export function weekKeyOf(d: Date): string {
  const day = startOfDay(d);
  return isoDate(addDays(day, -day.getDay()));
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function yearKeyOf(d: Date): string {
  return String(d.getFullYear());
}

/** For Prisma `@db.Date` columns (e.g. CashCount.countDate) ONLY. Prisma stores a
 * date-only column using the UTC calendar day of the JS Date instant it's given.
 * `startOfDay()` zeroes hours in *local* time, which for any positive-offset
 * timezone (this store's Africa/Cairo, UTC+3) produces an instant that's still on
 * the *previous* UTC calendar day — e.g. local midnight Aug 10 (+03:00) is
 * 2026-08-09T21:00Z, so Prisma would store "2026-08-09". This reads the intended
 * calendar day from local Y/M/D getters (same fix as isoDate()) and constructs a
 * UTC-midnight instant for that exact day, which round-trips correctly. */
export function dbDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
