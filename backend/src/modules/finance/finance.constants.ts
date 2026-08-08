import { ExpenseFrequency } from "@prisma/client";

/**
 * Average days per month/quarter/year (365.25/12 etc.) — using 30 would drift ~6 days a
 * year and quietly understate annualised cost. Every frequency is normalised to a *daily*
 * rate so a reporting window of any length is just `dailyRate × days`, and a 28-day
 * February costs less rent than a 31-day March, which is what actually happens.
 */
export const DAYS_PER_YEAR = 365.25;
export const DAYS_PER_MONTH = DAYS_PER_YEAR / 12; // 30.4375
export const DAYS_PER_QUARTER = DAYS_PER_YEAR / 4; // 91.3125

/** Divisor that converts an amount at the given frequency into a per-day rate. */
export const FREQUENCY_DAY_DIVISOR: Record<Exclude<ExpenseFrequency, "one_time">, number> = {
  daily: 1,
  weekly: 7,
  monthly: DAYS_PER_MONTH,
  quarterly: DAYS_PER_QUARTER,
  yearly: DAYS_PER_YEAR,
};

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Money rounding — 2dp, and never returns `-0`, which JSON-serialises as "-0". */
export function money(value: number): number {
  const rounded = Number(value.toFixed(2));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Percentages to 2dp. Returns null when the denominator is zero rather than Infinity/NaN. */
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return money((numerator / denominator) * 100);
}

/** Safe ratio — null instead of Infinity when the denominator is zero or negative. */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return money(numerator / denominator);
}
