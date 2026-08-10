"use client";

import * as React from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { downloadExport, type ExportFormat, type ExportKind } from "@/lib/api/export";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const FORMATS: ExportFormat[] = ["xlsx", "csv", "pdf"];

/** Excel/CSV/PDF dropdown — kept separate from the single-format ExportButton
 * (which stays xlsx-only for financials/sales/stock) rather than overloading it. */
export function ExportMenuButton({
  kind,
  storeId,
  params,
  path,
  label,
  formats = FORMATS,
}: {
  kind: ExportKind;
  storeId: string | null;
  params?: Record<string, string>;
  /** Overrides the default /export/{kind}.{format} URL — for daily-closing.pdf etc. */
  path?: (format: ExportFormat) => string;
  label?: string;
  /** Restrict the offered formats — e.g. PDF-only report endpoints. */
  formats?: ExportFormat[];
}) {
  const { t } = useLocale();
  const [busyFormat, setBusyFormat] = React.useState<ExportFormat | null>(null);

  async function run(format: ExportFormat) {
    if (!storeId) return;
    setBusyFormat(format);
    try {
      await downloadExport(kind, format, storeId, params, path?.(format));
      toast.success(t("exports.downloaded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("exports.downloadFailed"));
    } finally {
      setBusyFormat(null);
    }
  }

  const busy = busyFormat !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!storeId || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {label ?? t("exports.download")}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.includes("xlsx") && (
          <DropdownMenuItem onClick={() => run("xlsx")}>{t("exports.formatExcel")}</DropdownMenuItem>
        )}
        {formats.includes("csv") && (
          <DropdownMenuItem onClick={() => run("csv")}>{t("exports.formatCsv")}</DropdownMenuItem>
        )}
        {formats.includes("pdf") && (
          <DropdownMenuItem onClick={() => run("pdf")}>{t("exports.formatPdf")}</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
