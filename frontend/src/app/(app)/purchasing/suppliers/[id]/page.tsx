"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  getLedger,
  getSupplier,
  linkProduct,
  listLinkedProducts,
  recordPayment,
} from "@/lib/api/suppliers";
import { listProducts } from "@/lib/api/catalog";
import { formatDateTime, formatMoney, titleCase } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const linkSchema = z.object({
  productId: z.string().min(1, "Required"),
  supplierCostPrice: z.coerce.number().min(0),
  piecesPerCarton: z.coerce.number().int().min(1).optional(),
  isPreferred: z.boolean().default(false),
});
type LinkFormValues = z.infer<typeof linkSchema>;

function LinkProductDialog({ supplierId }: { supplierId: string }) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: listProducts });

  const form = useForm<LinkFormValues>({
    resolver: zodResolver(linkSchema) as Resolver<LinkFormValues>,
    defaultValues: { productId: "", supplierCostPrice: 0, isPreferred: false },
  });

  const mutation = useMutation({
    mutationFn: (values: LinkFormValues) => linkProduct(supplierId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-products", supplierId] });
      toast.success("Product linked");
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to link product"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Link product
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link product to supplier</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {products?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.modelName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="supplierCostPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier cost price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="piecesPerCarton"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pieces per carton (optional)</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="isPreferred"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Preferred supplier for this product</FormLabel>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Link product
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const paymentSchema = z.object({
  type: z.enum(["deposit", "payment", "credit_note"]),
  amount: z.coerce.number().min(0.01),
  note: z.string().optional(),
});
type PaymentFormValues = z.infer<typeof paymentSchema>;

function RecordPaymentDialog({ supplierId }: { supplierId: string }) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as Resolver<PaymentFormValues>,
    defaultValues: { type: "payment", amount: 0, note: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: PaymentFormValues) => recordPayment(supplierId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-ledger", supplierId] });
      toast.success("Ledger entry recorded");
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to record entry"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record ledger entry</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="deposit">Deposit</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="credit_note">Credit note</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const supplierId = params.id;

  const { data: supplier, isLoading } = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: () => getSupplier(supplierId),
  });
  const { data: linkedProducts } = useQuery({
    queryKey: ["supplier-products", supplierId],
    queryFn: () => listLinkedProducts(supplierId),
  });
  const { data: ledger } = useQuery({
    queryKey: ["supplier-ledger", supplierId],
    queryFn: () => getLedger(supplierId),
  });

  if (isLoading || !supplier) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const currentBalance = ledger?.[0]?.balanceAfter;

  return (
    <div className="space-y-4">
      <PageHeader title={supplier.name} description={supplier.factoryName ?? undefined} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Balance paid to date</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {currentBalance ? formatMoney(currentBalance) : formatMoney(0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Payment terms</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{supplier.paymentTerms ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Lead time</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {supplier.leadTimeDaysMin != null && supplier.leadTimeDaysMax != null
              ? `${supplier.leadTimeDaysMin}–${supplier.leadTimeDaysMax} days`
              : "—"}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Linked Products</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-3">
          <div className="flex justify-end">
            <LinkProductDialog supplierId={supplierId} />
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Supplier cost</TableHead>
                  <TableHead className="text-right">Pieces/carton</TableHead>
                  <TableHead>Preferred</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!linkedProducts || linkedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No products linked yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  linkedProducts.map((lp) => (
                    <TableRow key={lp.id}>
                      <TableCell className="font-medium">{lp.product?.modelName ?? lp.productId}</TableCell>
                      <TableCell className="text-right">{formatMoney(lp.supplierCostPrice)}</TableCell>
                      <TableCell className="text-right">{lp.piecesPerCarton ?? "—"}</TableCell>
                      <TableCell>{lp.isPreferred && <Badge variant="success">Preferred</Badge>}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-3">
          <div className="flex justify-end">
            <RecordPaymentDialog supplierId={supplierId} />
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance after</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!ledger || ledger.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No ledger entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  ledger.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell>{titleCase(entry.type)}</TableCell>
                      <TableCell className="text-right">
                        {entry.type === "credit_note" ? "-" : ""}
                        {formatMoney(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(entry.balanceAfter)}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.note ?? "—"}</TableCell>
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
