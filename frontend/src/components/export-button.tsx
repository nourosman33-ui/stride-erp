"use client";

import * as React from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { downloadWorkbook, type ExportKind } from "@/lib/api/export";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";

/** Downloads an .xlsx for the active store. Sits in a PageHeader's actions slot. */
export function ExportButton({
  kind,
  storeId,
  params,
  size = "sm",
  variant = "outline",
}: {
  kind: ExportKind;
  storeId: string | null;
  params?: Record<string, string>;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
}) {
  const { t } = useLocale();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    if (!storeId) return;
    setBusy(true);
    try {
      await downloadWorkbook(kind, storeId, params);
      toast.success(t("exports.downloaded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("exports.downloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} disabled={!storeId || busy} onClick={run}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
      {busy ? t("exports.downloading") : t("exports.download")}
    </Button>
  );
}
