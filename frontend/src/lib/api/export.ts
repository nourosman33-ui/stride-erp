import { apiFetch, getAuthToken } from "./client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export interface FeedToken {
  id: string;
  token: string;
  storeId: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy?: { fullName: string };
}

export type ExportKind = "financials" | "sales" | "stock" | "expenses";
export type ExportFormat = "xlsx" | "csv" | "pdf";

/**
 * Downloads any export. apiFetch parses JSON, so this goes direct to fetch to keep
 * the binary intact, then triggers the browser's own save dialog via an object URL.
 * `path` overrides the default `/export/{kind}.{format}` shape for the two report
 * endpoints (daily-closing.pdf, financial-report.pdf) that aren't kind-shaped.
 */
export async function downloadExport(
  kind: ExportKind,
  format: ExportFormat,
  storeId: string,
  extraParams: Record<string, string> = {},
  path?: string,
): Promise<void> {
  const url = new URL(`${API_BASE_URL}${path ?? `/export/${kind}.${format}`}`);
  if (storeId) url.searchParams.set("storeId", storeId);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);

  const token = getAuthToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    // Errors still come back as JSON even on a binary endpoint.
    const message = await res
      .json()
      .then((b) => b.message as string)
      .catch(() => `Export failed (${res.status})`);
    throw new Error(message);
  }

  // Prefer the filename the server chose so the date stamp is consistent.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? `stride-${kind}.${format}`;

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Back-compat wrapper — existing financials/sales/stock call sites are unaffected. */
export function downloadWorkbook(kind: ExportKind, storeId: string, extraParams: Record<string, string> = {}) {
  return downloadExport(kind, "xlsx", storeId, extraParams);
}

/** Base URL a spreadsheet points at. The token is the credential — treat it as a secret. */
export function feedUrl(token: string, feed: "financials" | "forecast" | "sales" | "stock"): string {
  return `${API_BASE_URL}/feeds/${token}/${feed}`;
}

export function listFeedTokens(storeId: string) {
  return apiFetch<FeedToken[]>("/export/feed-tokens", { params: { storeId } });
}

export function createFeedToken(storeId: string, label: string) {
  return apiFetch<FeedToken>("/export/feed-tokens", {
    method: "POST",
    body: { storeId, label },
  });
}

export function revokeFeedToken(id: string) {
  return apiFetch<FeedToken>(`/export/feed-tokens/${id}`, { method: "DELETE" });
}

// ------------------------------------------------------------------ forecast

export interface ForecastMonth {
  month: string;
  label: string;
  projectedNetRevenue: number;
  projectedCogs: number;
  projectedGrossProfit: number;
  projectedOperatingCosts: number;
  projectedNetProfit: number;
  cumulativeNetProfit: number;
  cumulativeVsInvestment: number;
}

export interface Forecast {
  currency: string;
  generatedAt: string;
  basis: {
    lookbackDays: number;
    daysWithData: number;
    averageDailyNetRevenue: number;
    dailyTrend: number;
    trendApplied: boolean;
    grossMarginPct: number | null;
    monthlyFixedCosts: number;
    confidence: "low" | "medium";
    note: string;
  };
  months: ForecastMonth[];
  summary: {
    horizonMonths: number;
    totalProjectedNetRevenue: number;
    totalProjectedNetProfit: number;
    paybackMonth: string | null;
    firstProfitableMonth: string | null;
    initialInvestment: number;
  };
}

export function getForecast(storeId: string, horizonMonths = 6) {
  return apiFetch<Forecast>("/finance/forecast", {
    params: { storeId, horizonMonths: String(horizonMonths) },
  });
}
