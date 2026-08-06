"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { CheckCircle2, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

import { approvePurchaseOrder, getPurchaseOrder, receiveGoods } from "@/lib/api/purchasing";
import { useAuth } from "@/lib/auth-context";
import { formatDate, formatDateTime, formatMoney, titleCase } from "@/lib/format";
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
      toast.success("Goods receipt posted");
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to receive goods"),
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
          Receive goods
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive goods</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">All lines are fully received.</p>
          ) : (
            pending.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">{line.variant?.product?.modelName ?? "Variant"}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.variant?.barcode} · remaining {line.remaining}
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
              Post receipt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const poId = params.id;
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order", poId],
    queryFn: () => getPurchaseOrder(poId),
  });

  const approveMutation = useMutation({
    mutationFn: () => approvePurchaseOrder(poId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", poId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Purchase order approved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to approve"),
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

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Purchase Order — ${po.supplier?.name ?? po.supplierId}`}
        description={`Placed ${formatDate(po.orderDate)}`}
        actions={
          <div className="flex gap-2">
            {canApprove && (
              <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                {approveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Approve
              </Button>
            )}
            {canReceive && <ReceiveGoodsDialog poId={poId} lines={linesWithRemaining} />}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <PoStatusBadge status={po.status} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Order total</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatMoney(total)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Expected delivery</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{formatDate(po.expectedDeliveryDate)}</CardContent>
        </Card>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Line total</TableHead>
              <TableHead className="text-right">Expected profit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linesWithRemaining.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.variant?.product?.modelName ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{l.variant?.barcode ?? "—"}</TableCell>
                <TableCell className="text-right">{l.quantityOrdered}</TableCell>
                <TableCell className="text-right">
                  {l.quantityOrdered - l.remaining} / {l.quantityOrdered}
                </TableCell>
                <TableCell className="text-right">{formatMoney(l.costPrice)}</TableCell>
                <TableCell className="text-right">{formatMoney(l.lineTotal)}</TableCell>
                <TableCell className="text-right text-success">{formatMoney(l.expectedProfit)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {po.goodsReceipts && po.goodsReceipts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Goods receipts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {po.goodsReceipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                <span>{formatDateTime(r.receivedDate)}</span>
                <Badge variant={r.status === "full" ? "success" : r.status === "discrepancy" ? "destructive" : "warning"}>
                  {titleCase(r.status)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
