"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Search, Star } from "lucide-react";
import { toast } from "sonner";

import { createSupplier, listSuppliers } from "@/lib/api/suppliers";
import { useLocale } from "@/lib/i18n/locale-context";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().min(1, "Required"),
  factoryName: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  paymentTerms: z.string().optional(),
  leadTimeDaysMin: z.coerce.number().int().min(0).optional(),
  leadTimeDaysMax: z.coerce.number().int().min(0).optional(),
  qualityRating: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function NewSupplierDialog() {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { name: "", factoryName: "", phone: "", whatsapp: "", paymentTerms: "", notes: "" },
  });

  const mutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(t("suppliers.supplierCreated"));
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("suppliers.createFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {t("suppliers.newSupplier")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("suppliers.newDialogTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("suppliers.name")}</FormLabel>
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
                name="factoryName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("suppliers.factoryOptional")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>{t("suppliers.phoneOptional")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="leadTimeDaysMin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("suppliers.leadTimeMin")}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="leadTimeDaysMax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("suppliers.leadTimeMax")}</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="qualityRating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("suppliers.qualityRating")}</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max="5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="paymentTerms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("suppliers.paymentTerms")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("suppliers.paymentTermsPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("suppliers.notesOptional")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("suppliers.createSupplier")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function SuppliersPage() {
  const { t } = useLocale();
  const [search, setSearch] = React.useState("");
  const { data: suppliers, isLoading } = useQuery({ queryKey: ["suppliers"], queryFn: listSuppliers });

  const filtered = (suppliers ?? []).filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <PageHeader title={t("suppliers.title")} description={t("suppliers.description")} actions={<NewSupplierDialog />} />

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("suppliers.searchPlaceholder")} className="ps-8" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("suppliers.colName")}</TableHead>
              <TableHead>{t("suppliers.colFactory")}</TableHead>
              <TableHead>{t("suppliers.colPhone")}</TableHead>
              <TableHead>{t("suppliers.colLeadTime")}</TableHead>
              <TableHead>{t("suppliers.colQuality")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {t("suppliers.noSuppliers")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link href={`/purchasing/suppliers/${s.id}`} className="hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell>{s.factoryName ?? "—"}</TableCell>
                  <TableCell>{s.phone ?? "—"}</TableCell>
                  <TableCell>
                    {s.leadTimeDaysMin != null && s.leadTimeDaysMax != null
                      ? `${s.leadTimeDaysMin}–${s.leadTimeDaysMax} ${t("suppliers.daysSuffix")}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {s.qualityRating ? (
                      <span className="flex items-center gap-1">
                        <Star className="size-3.5 fill-warning text-warning" />
                        {s.qualityRating}/5
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
