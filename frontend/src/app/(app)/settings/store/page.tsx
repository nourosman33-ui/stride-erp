"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createStore, listStores, updateStore } from "@/lib/api/stores";
import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { useLocale } from "@/lib/i18n/locale-context";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
  concept: z.string().optional(),
  targetMarket: z.string().optional(),
  currency: z.string().min(1),
  vatRate: z.coerce.number().min(0).max(100),
  poApprovalThreshold: z.coerce.number().min(0),
  discountApprovalLimitPct: z.coerce.number().min(0).max(100),
});
type EditValues = z.infer<typeof editSchema>;

export default function StoreSettingsPage() {
  const { hasRole } = useAuth();
  const { t } = useLocale();
  const { activeStoreId, setActiveStoreId } = useActiveStore();
  const queryClient = useQueryClient();
  const canManage = hasRole("owner", "manager");

  const { data: stores, isLoading } = useQuery({ queryKey: ["stores"], queryFn: listStores });
  const activeStore = stores?.find((s) => s.id === activeStoreId) ?? stores?.[0];

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema) as Resolver<EditValues>,
    values: activeStore
      ? {
          name: activeStore.name,
          address: activeStore.address ?? "",
          concept: activeStore.concept ?? "",
          targetMarket: activeStore.targetMarket ?? "",
          currency: activeStore.currency,
          vatRate: Number(activeStore.vatRate),
          poApprovalThreshold: Number(activeStore.poApprovalThreshold),
          discountApprovalLimitPct: Number(activeStore.discountApprovalLimitPct),
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (values: EditValues) => updateStore(activeStore!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      toast.success(t("settingsStore.storeUpdated"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("settingsStore.updateFailed")),
  });

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

          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base">{activeStore?.name}</CardTitle>
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
        </>
      )}
    </div>
  );
}
