"use client";

import * as React from "react";
import { FileText, Loader2, Paperclip } from "lucide-react";

import { fetchReceiptObjectUrl } from "@/lib/api/expenses";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Views an uploaded expense receipt. Fetches with a real Authorization header
 * (receipts are financial data, served only to authenticated users) and renders
 * via an object URL — a bare <img src> can't carry a bearer token. */
export function ReceiptViewer({ expenseId }: { expenseId: string }) {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [asset, setAsset] = React.useState<{ url: string; mimeType: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchReceiptObjectUrl(expenseId);
      setAsset(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("expenses.receiptUploadFailed"));
    } finally {
      setLoading(false);
    }
  }, [expenseId, t]);

  React.useEffect(() => {
    if (open && !asset && !loading) load();
    // Revoke the object URL when the dialog closes so it doesn't leak memory.
    return () => {
      if (asset) URL.revokeObjectURL(asset.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <Paperclip className="size-3.5" />
        {t("expenses.viewReceipt")}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("expenses.viewReceipt")}</DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="py-6 text-center text-sm text-destructive">{error}</p>}
        {asset && !loading && (
          <div className="flex justify-center">
            {asset.mimeType === "application/pdf" ? (
              <a
                href={asset.url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-2 py-10 text-sm text-primary hover:underline"
              >
                <FileText className="size-10" />
                {t("expenses.viewReceipt")}
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.url} alt="" className="max-h-[70vh] rounded-md object-contain" />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
