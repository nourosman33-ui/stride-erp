"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getCustomer, updateCustomer } from "@/lib/api/customers";
import { useActiveStore } from "@/lib/store-context";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { formatDate, formatDateTime, formatMoney, formatNumber, toNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const TIER_VARIANT: Record<string, "outline" | "secondary" | "warning" | "success"> = {
  bronze: "outline",
  silver: "secondary",
  gold: "warning",
  platinum: "success",
};

function TierProgress({
  tier,
  lifetimeSpending,
  thresholds,
}: {
  tier: string;
  lifetimeSpending: number;
  thresholds: { silver: number; gold: number; platinum: number };
}) {
  const { t } = useLocale();

  if (tier === "platinum") {
    return <p className="text-sm text-muted-foreground">{t("customerDetail.maxTierReached")}</p>;
  }

  const [floor, ceiling, nextTierKey] =
    tier === "gold"
      ? [thresholds.gold, thresholds.platinum, "platinum"]
      : tier === "silver"
        ? [thresholds.silver, thresholds.gold, "gold"]
        : [0, thresholds.silver, "silver"];

  const progressPct = Math.min(100, Math.max(0, ((lifetimeSpending - floor) / (ceiling - floor)) * 100));
  const amountNeeded = Math.max(0, ceiling - lifetimeSpending);

  return (
    <div className="space-y-1.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("customerDetail.nextTierAt", {
          amount: formatNumber(Math.round(amountNeeded)),
          tier: t(`loyaltyTiers.${nextTierKey}` as TranslationKey),
        })}
      </p>
    </div>
  );
}

const editSchema = z.object({
  name: z.string().min(1, "Required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});
type EditValues = z.infer<typeof editSchema>;

function EditCustomerDialog({ customerId, defaults }: { customerId: string; defaults: EditValues }) {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema) as Resolver<EditValues>,
    values: defaults,
  });

  const mutation = useMutation({
    mutationFn: (values: EditValues) => updateCustomer(customerId, { ...values, email: values.email || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast.success(t("customerDetail.updated"));
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("customerDetail.updateFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("customerDetail.editCustomer")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("customerDetail.editCustomer")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customers.phoneOptional")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customers.emailOptional")}</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("common.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomerDetailPage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const { activeStore, activeStoreId } = useActiveStore();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", customerId, activeStoreId],
    queryFn: () => getCustomer(customerId, activeStoreId ?? undefined),
  });

  if (isLoading || !customer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const thresholds = {
    silver: toNumber(activeStore?.loyaltySilverThreshold ?? 5000),
    gold: toNumber(activeStore?.loyaltyGoldThreshold ?? 15000),
    platinum: toNumber(activeStore?.loyaltyPlatinumThreshold ?? 40000),
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={customer.name}
        description={t("customerDetail.registeredOn", { date: formatDate(customer.createdAt) })}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={TIER_VARIANT[customer.tier]}>{t(`loyaltyTiers.${customer.tier}` as TranslationKey)}</Badge>
            <EditCustomerDialog
              customerId={customerId}
              defaults={{
                name: customer.name,
                phone: customer.phone ?? "",
                email: customer.email ?? "",
                notes: customer.notes ?? "",
              }}
            />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("customerDetail.lifetimeSpending")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatMoney(customer.lifetimeSpending)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("customerDetail.totalOrders")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatNumber(customer.totalOrders)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("customerDetail.loyaltyPoints")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatNumber(customer.pointsBalance)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("customerDetail.lastPurchase")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt) : t("customerDetail.never")}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("customerDetail.tierProgress")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TierProgress tier={customer.tier} lifetimeSpending={customer.lifetimeSpending} thresholds={thresholds} />
        </CardContent>
      </Card>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">{t("customerDetail.tabHistory")}</TabsTrigger>
          <TabsTrigger value="loyalty">{t("customerDetail.tabLoyalty")}</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customerDetail.colDate")}</TableHead>
                  <TableHead>{t("customerDetail.colInvoice")}</TableHead>
                  <TableHead>{t("customerDetail.colStore")}</TableHead>
                  <TableHead className="text-end">{t("customerDetail.colTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!customer.salesOrders || customer.salesOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      {t("customerDetail.noOrdersYet")}
                    </TableCell>
                  </TableRow>
                ) : (
                  customer.salesOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{formatDateTime(o.orderDate)}</TableCell>
                      <TableCell className="font-mono text-xs">{o.invoiceNumber}</TableCell>
                      <TableCell>{o.store?.name ?? "—"}</TableCell>
                      <TableCell className="text-end font-medium">{formatMoney(o.grandTotal)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="loyalty">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customerDetail.colDate")}</TableHead>
                  <TableHead>{t("customerDetail.colType")}</TableHead>
                  <TableHead className="text-end">{t("customerDetail.colPoints")}</TableHead>
                  <TableHead>{t("customerDetail.colNote")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!customer.loyaltyTransactions || customer.loyaltyTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      {t("customerDetail.noLoyaltyYet")}
                    </TableCell>
                  </TableRow>
                ) : (
                  customer.loyaltyTransactions.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{formatDateTime(l.createdAt)}</TableCell>
                      <TableCell>{t(`customerDetail.type${l.type.charAt(0).toUpperCase()}${l.type.slice(1)}` as TranslationKey)}</TableCell>
                      <TableCell className={`text-end font-medium ${l.pointsDelta >= 0 ? "text-success" : "text-destructive"}`}>
                        {l.pointsDelta >= 0 ? "+" : ""}
                        {formatNumber(l.pointsDelta)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.note ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
