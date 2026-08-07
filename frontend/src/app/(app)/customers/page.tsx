"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { createCustomer, listCustomers } from "@/lib/api/customers";
import { useLocale } from "@/lib/i18n/locale-context";
import { formatMoney, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().min(1, "Required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  gender: z.string().optional(),
  birthDate: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function NewCustomerDialog() {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { name: "", phone: "", email: "", gender: "", birthDate: "", notes: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createCustomer({
        ...values,
        email: values.email || undefined,
        gender: values.gender || undefined,
        birthDate: values.birthDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(t("customers.customerCreated"));
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("customers.createFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {t("customers.newCustomer")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("customers.newDialogTitle")}</DialogTitle>
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
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customers.gender")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("common.selectPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">{t("customers.genderMale")}</SelectItem>
                        <SelectItem value="female">{t("customers.genderFemale")}</SelectItem>
                        <SelectItem value="other">{t("customers.genderOther")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customers.birthDateOptional")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.notesOptional")}</FormLabel>
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
                {t("customers.createCustomer")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomersPage() {
  const { t } = useLocale();
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", debouncedSearch],
    queryFn: () => listCustomers(debouncedSearch || undefined),
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t("customers.title")} description={t("customers.description")} actions={<NewCustomerDialog />} />

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("customers.searchPlaceholder")}
          className="ps-8"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("customers.colName")}</TableHead>
              <TableHead>{t("customers.colPhone")}</TableHead>
              <TableHead>{t("customers.colEmail")}</TableHead>
              <TableHead className="text-end">{t("customers.colOrders")}</TableHead>
              <TableHead className="text-end">{t("customers.colLifetimeSpending")}</TableHead>
              <TableHead className="text-end">{t("customers.colPoints")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !customers || customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {t("customers.noCustomers")}
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/customers/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell className="text-end">{formatNumber(c.totalOrders)}</TableCell>
                  <TableCell className="text-end">{formatMoney(c.lifetimeSpending)}</TableCell>
                  <TableCell className="text-end">
                    <Badge variant="secondary">{formatNumber(c.pointsBalance)}</Badge>
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
