"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createStore, listStores, updateStore } from "@/lib/api/stores";
import type { Store } from "@/lib/api/types";
import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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

const createSchema = z.object({
  name: z.string().min(1, "Required"),
  address: z.string().optional(),
  currency: z.string().min(1).default("EGP"),
  vatRate: z.coerce.number().min(0).max(100).default(14),
});
type CreateValues = z.infer<typeof createSchema>;

function NewStoreDialog() {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const { setActiveStoreId } = useActiveStore();

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema) as Resolver<CreateValues>,
    defaultValues: { name: "", address: "", currency: "EGP", vatRate: 14 },
  });

  const mutation = useMutation({
    mutationFn: createStore,
    onSuccess: (store) => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      setActiveStoreId(store.id);
      toast.success(t("settingsStore.storeCreated"));
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("settingsStore.createFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {t("settingsStore.newStore")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settingsStore.newDialogTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settingsStore.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settingsStore.address")}</FormLabel>
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
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.currency")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vatRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.vatRate")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" max="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("settingsStore.createStore")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({
  name: z.string().min(1, "Required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  concept: z.string().optional(),
  targetMarket: z.string().optional(),
  currency: z.string().min(1),
  vatRate: z.coerce.number().min(0).max(100),
  poApprovalThreshold: z.coerce.number().min(0),
  discountApprovalLimitPct: z.coerce.number().min(0).max(100),
  logoUrl: z.string().optional(),
  taxNumber: z.string().optional(),
  receiptFooterLine1: z.string().optional(),
  receiptFooterLine2: z.string().optional(),
  returnPeriodDays: z.coerce.number().int().min(0),
  loyaltyPointsPerCurrency: z.coerce.number().min(0),
  loyaltyPointValue: z.coerce.number().min(0),
  loyaltySilverThreshold: z.coerce.number().min(0),
  loyaltyGoldThreshold: z.coerce.number().min(0),
  loyaltyPlatinumThreshold: z.coerce.number().min(0),
});
type EditValues = z.infer<typeof editSchema>;

/**
 * Takes `store` as a required prop (never undefined) and the parent keys this component by
 * `store.id` — so `defaultValues` are captured correctly on the very first synchronous render
 * instead of arriving a tick later via RHF's `values` prop. That async gap previously let a
 * premature submit (form visible before its fields were populated) coerce every numeric field
 * to 0 via zod's `coerce.number()` on an empty string, silently zeroing out real store settings.
 */
function StoreEditForm({ store, canManage }: { store: Store; canManage: boolean }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema) as Resolver<EditValues>,
    defaultValues: {
      name: store.name,
      address: store.address ?? "",
      phone: store.phone ?? "",
      concept: store.concept ?? "",
      targetMarket: store.targetMarket ?? "",
      currency: store.currency,
      vatRate: Number(store.vatRate),
      poApprovalThreshold: Number(store.poApprovalThreshold),
      discountApprovalLimitPct: Number(store.discountApprovalLimitPct),
      logoUrl: store.logoUrl ?? "",
      taxNumber: store.taxNumber ?? "",
      receiptFooterLine1: store.receiptFooterLine1 ?? "",
      receiptFooterLine2: store.receiptFooterLine2 ?? "",
      returnPeriodDays: store.returnPeriodDays,
      loyaltyPointsPerCurrency: Number(store.loyaltyPointsPerCurrency),
      loyaltyPointValue: Number(store.loyaltyPointValue),
      loyaltySilverThreshold: Number(store.loyaltySilverThreshold),
      loyaltyGoldThreshold: Number(store.loyaltyGoldThreshold),
      loyaltyPlatinumThreshold: Number(store.loyaltyPlatinumThreshold),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: EditValues) => updateStore(store.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      toast.success(t("settingsStore.storeUpdated"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("settingsStore.updateFailed")),
  });

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-base">{store.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settingsStore.name")}</FormLabel>
                  <FormControl>
                    <Input disabled={!canManage} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.addressField")}</FormLabel>
                    <FormControl>
                      <Input disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.phoneField")}</FormLabel>
                    <FormControl>
                      <Input disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="concept"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.concept")}</FormLabel>
                    <FormControl>
                      <Input disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetMarket"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.targetMarket")}</FormLabel>
                    <FormControl>
                      <Input disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.currency")}</FormLabel>
                    <FormControl>
                      <Input disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vatRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.vatRateField")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="poApprovalThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.poThreshold")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discountApprovalLimitPct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.discountLimit")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Separator />
            <p className="text-sm font-medium">{t("settingsStore.brandingReceipt")}</p>
            <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settingsStore.logoUrl")}</FormLabel>
                  <FormControl>
                    <Input disabled={!canManage} placeholder="https://…" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">{t("settingsStore.logoUrlHelp")}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taxNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settingsStore.taxNumber")}</FormLabel>
                  <FormControl>
                    <Input disabled={!canManage} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="receiptFooterLine1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settingsStore.receiptFooterLine1")}</FormLabel>
                  <FormControl>
                    <Input disabled={!canManage} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="receiptFooterLine2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settingsStore.receiptFooterLine2")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} disabled={!canManage} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />
            <p className="text-sm font-medium">{t("settingsStore.returnsSection")}</p>
            <FormField
              control={form.control}
              name="returnPeriodDays"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>{t("settingsStore.returnPeriodDays")}</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="1" disabled={!canManage} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />
            <p className="text-sm font-medium">{t("settingsStore.loyaltySection")}</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="loyaltyPointsPerCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("settingsStore.loyaltyPointsPerCurrency", { currency: store.currency })}
                    </FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="loyaltyPointValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.loyaltyPointValue", { currency: store.currency })}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="loyaltySilverThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.loyaltySilverThreshold")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="0" disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="loyaltyGoldThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.loyaltyGoldThreshold")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="0" disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="loyaltyPlatinumThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsStore.loyaltyPlatinumThreshold")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="0" disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {canManage && (
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("common.saveChanges")}
              </Button>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function StoreSettingsPage() {
  const { hasRole } = useAuth();
  const { t } = useLocale();
  const { activeStoreId, setActiveStoreId } = useActiveStore();
  const canManage = hasRole("owner", "manager");

  const { data: stores, isLoading } = useQuery({ queryKey: ["stores"], queryFn: listStores });
  const activeStore = stores?.find((s) => s.id === activeStoreId) ?? stores?.[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("settingsStore.title")}
        description={t("settingsStore.description")}
        actions={hasRole("owner") ? <NewStoreDialog /> : undefined}
      />

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !stores || stores.length === 0 ? (
        <Alert>
          <AlertTitle>{t("settingsStore.noStoreYet")}</AlertTitle>
          <AlertDescription>{t("settingsStore.noStoreDesc")}</AlertDescription>
        </Alert>
      ) : (
        <>
          {stores.length > 1 && (
            <div className="max-w-xs">
              <Select value={activeStore?.id} onValueChange={setActiveStoreId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {activeStore && <StoreEditForm key={activeStore.id} store={activeStore} canManage={canManage} />}
        </>
      )}
    </div>
  );
}
