"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { revalueStock } from "@/lib/api/inventory";
import type { StockOnHandRow } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Corrects the cost of stock already on the shelf. This is separate from editing the
 * product's price on purpose: the price is what you *will* pay/charge, while this restates
 * what the stock you already hold is worth.
 */
export function FixCostDialog({
  row,
  storeId,
  currency,
}: {
  row: StockOnHandRow;
  storeId: string;
  currency?: string;
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [cost, setCost] = React.useState("");
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setCost(row.avgUnitCost ? String(row.avgUnitCost) : "");
      setReason("");
    }
  }, [open, row.avgUnitCost]);

  const newCost = Number(cost) || 0;
  const newValue = newCost * row.quantityOnHand;

  const mutation = useMutation({
    mutationFn: () =>
      revalueStock({
        storeId,
        variantId: row.variantId,
        newUnitCost: newCost,
        reason: reason.trim() || undefined,
      }),
    onSuccess: (result) => {
      // Everything that reads inventory value has to re-read: the stock list, the
      // dashboard tile, and the P&L (COGS is derived from this cost).
      queryClient.invalidateQueries({ queryKey: ["stock-on-hand"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-value"] });
      queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["forecast"] });
      toast.success(
        t("manage.costFixed", { value: formatMoney(result.inventoryValue, currency) }),
      );
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("manage.costFixFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs">
          <Wrench className="size-3.5" />
          {t("manage.fixCost")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("manage.fixCostTitle")}</DialogTitle>
          <DialogDescription>
            {row.productName} · {row.color} · {row.size}
          </DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          {t("manage.fixCostWhy")}
        </p>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("manage.currentCost")}</span>
            <span className="tabular-nums">
              {row.avgUnitCost === null ? t("manage.noCost") : formatMoney(row.avgUnitCost, currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("manage.currentValue")}</span>
            <span className="tabular-nums">{formatMoney(row.inventoryValue ?? 0, currency)}</span>
          </div>
        </div>

        <Separator />

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("manage.newCost")}</label>
            <Input
              autoFocus
              type="number"
              step="0.01"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("manage.onHandQty", { qty: row.quantityOnHand })}
            </p>
          </div>

          <div className="flex justify-between rounded-md border bg-muted/40 p-2.5 text-sm font-medium">
            <span>{t("manage.newValue")}</span>
            <span className="tabular-nums">{formatMoney(newValue, currency)}</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("manage.fixCostReason")}</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("manage.fixCostReasonPlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || row.quantityOnHand <= 0}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("manage.applyFix")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
