"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { CheckCircle2, Loader2, PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { approvePurchaseOrder, deletePurchaseOrder, getPurchaseOrder, receiveGoods } from "@/lib/api/purchasing";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { PoStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function ReceiveGoodsDialog({
  poId,
  lines,
}: {
  poId: string;
  lines: { id: string; variant?: { barcode: string; product?: { modelName: string } }; remaining: number }[];
}) {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<Record<string, number>>({
    defaultValues: Object.fromEntries(lines.map((l) => [l.id, l.remaining])),
  });

  const mutation = useMutation({
    mutationFn: (values: Record<string, number>) =>
      receiveGoods(
        poId,
        lines
          .filter((l) => Number(values[l.id]) > 0)
          .map((l) => ({ purchaseOrderLineId: l.id, quantityReceived: Number(values[l.id]) })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", poId] });
      queryClient.invalidateQueries({ queryKey: ["stock-on-hand"] });
      toast.success(t("purchaseOrderDetail.receiptPosted"));
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("purchaseOrderDetail.receiveFailed")),
  });

  const pending = lines.filter((l) => l.remaining > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) reset(Object.fromEntries(lines.map((l) => [l.id, l.remaining])));
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PackageCheck className="size-4" />
          {t("purchaseOrderDetail.receiveGoods")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("purchaseOrderDetail.receiveDialogTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("purchaseOrderDetail.allReceived")}</p>
          ) : (
            pending.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">{line.variant?.product?.modelName ?? "Variant"}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.variant?.barcode} · {t("purchaseOrderDetail.remaining")} {line.remaining}
                  </p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={line.remaining}
                  className="w-24"
                  {...register(line.id, { valueAsNumber: true })}
                />
              </div>
            ))
          )}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || pending.length === 0}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("purchaseOrderDetail.postReceipt")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PurchaseOrderDetailPage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const poId = params.id;
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order", poId],
    queryFn: () => getPurchaseOrder(poId),
  });

  const approveMutation = useMutation({
    mutationFn: () => approvePurchaseOrder(poId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", poId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success(t("purchaseOrderDetail.approved"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("purchaseOrderDetail.approveFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePurchaseOrder(poId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success(t("purchaseOrderDetail.deleted"));
      router.push("/purchasing/orders");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("purchaseOrderDetail.deleteFailed")),
  });

  if (isLoading || !po) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const receivedByLine = new Map<string, number>();
  for (const receipt of po.goodsReceipts ?? []) {
    for (const line of receipt.lines ?? []) {
      receivedByLine.set(
        line.purchaseOrderLineId,
        (receivedByLine.get(line.purchaseOrderLineId) ?? 0) + line.quantityReceived,
      );
    }
  }

  const linesWithRemaining = (po.lines ?? []).map((l) => ({
    ...l,
    remaining: l.quantityOrdered - (receivedByLine.get(l.id) ?? 0),
  }));

  const total = (po.lines ?? []).reduce((sum, l) => sum + Number(l.lineTotal), 0);
  const canApprove = po.status === "pending_approval" && hasRole("owner", "manager");
  const canReceive = ["approved", "partially_received"].includes(po.status);
  // Mirrors the backend guard: refused once anything has been received.
  const canDelete =
    hasRole("owner") &&
    (po.goodsReceipts ?? []).length === 0 &&
    !["partially_received", "received"].includes(po.status);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${t("purchaseOrderDetail.titlePrefix")} ${po.supplier?.name ?? po.supplierId}`}
        description={t("purchaseOrderDetail.placedOn", { date: formatDate(po.orderDate) })}
        actions={
          <div className="flex gap-2">
            {canApprove && (
              <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                {approveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {t("purchaseOrderDetail.approve")}
              </Button>
            )}
            {canReceive && <ReceiveGoodsDialog poId={poId} lines={linesWithRemaining} />}
            {canDelete && (
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="size-4" />
                    {t("purchaseOrderDetail.deleteOrder")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>{t("purchaseOrderDetail.deleteConfirmTitle")}</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    {t("purchaseOrderDetail.deleteConfirmBody")}
                  </p>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate()}
                    >
                      {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                      {t("common.delete")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("purchaseOrderDetail.status")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PoStatusBadge status={po.status} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("purchaseOrderDetail.orderTotal")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatMoney(total)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("purchaseOrderDetail.expectedDelivery")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{formatDate(po.expectedDeliveryDate)}</CardContent>
        </Card>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("purchaseOrderDetail.colProduct")}</TableHead>
              <TableHead>{t("purchaseOrderDetail.colBarcode")}</TableHead>
              <TableHead className="text-end">{t("purchaseOrderDetail.colOrdered")}</TableHead>
              <TableHead className="text-end">{t("purchaseOrderDetail.colReceived")}</TableHead>
              <TableHead className="text-end">{t("purchaseOrderDetail.colCost")}</TableHead>
              <TableHead className="text-end">{t("purchaseOrderDetail.colLineTotal")}</TableHead>
              <TableHead className="text-end">{t("purchaseOrderDetail.colExpectedProfit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linesWithRemaining.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.variant?.product?.modelName ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{l.variant?.barcode ?? "—"}</TableCell>
                <TableCell className="text-end">{l.quantityOrdered}</TableCell>
                <TableCell className="text-end">
                  {l.quantityOrdered - l.remaining} / {l.quantityOrdered}
                </TableCell>
                <TableCell className="text-end">{formatMoney(l.costPrice)}</TableCell>
                <TableCell className="text-end">{formatMoney(l.lineTotal)}</TableCell>
                <TableCell className="text-end text-success">{formatMoney(l.expectedProfit)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {po.goodsReceipts && po.goodsReceipts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("purchaseOrderDetail.goodsReceipts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {po.goodsReceipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                <span>{formatDateTime(r.receivedDate)}</span>
                <Badge variant={r.status === "full" ? "success" : r.status === "discrepancy" ? "destructive" : "warning"}>
                  {t(`status.${r.status}`)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
