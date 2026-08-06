"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createCategory,
  createColor,
  createGender,
  createProductType,
  createSize,
  listCategories,
  listColors,
  listGenders,
  listProductTypes,
  listSizes,
} from "@/lib/api/catalog";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function NamedLookupTab({
  queryKey,
  fetcher,
  creator,
  label,
}: {
  queryKey: string;
  fetcher: () => Promise<{ id: string; name: string }[]>;
  creator: (name: string) => Promise<unknown>;
  label: string;
}) {
  const [name, setName] = React.useState("");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: fetcher });

  const mutation = useMutation({
    mutationFn: creator,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setName("");
      toast.success(`${label} added`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add"),
  });

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) mutation.mutate(name.trim());
        }}
        className="flex max-w-sm gap-2"
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${label.toLowerCase()}…`} />
        <Button type="submit" disabled={mutation.isPending || !name.trim()}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ) : !data || data.length === 0 ? (
                <TableRow>
                  <TableCell className="py-6 text-center text-muted-foreground">
                    No {label.toLowerCase()}s yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ColorsTab() {
  const [name, setName] = React.useState("");
  const [hex, setHex] = React.useState("#000000");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["colors"], queryFn: listColors });

  const mutation = useMutation({
    mutationFn: () => createColor(name.trim(), hex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colors"] });
      setName("");
      toast.success("Color added");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add"),
  });

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) mutation.mutate();
        }}
        className="flex max-w-md gap-2"
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New color name…" />
        <input
          type="color"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          className="h-9 w-12 rounded-md border"
        />
        <Button type="submit" disabled={mutation.isPending || !name.trim()}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ) : !data || data.length === 0 ? (
                <TableRow>
                  <TableCell className="py-6 text-center text-muted-foreground">No colors yet.</TableCell>
                </TableRow>
              ) : (
                data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="flex items-center gap-2">
                      <span
                        className="size-4 rounded-full border"
                        style={{ backgroundColor: c.hexCode ?? undefined }}
                      />
                      {c.name}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SizesTab() {
  const [standard, setStandard] = React.useState("EU");
  const [value, setValue] = React.useState("");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["sizes"], queryFn: listSizes });

  const mutation = useMutation({
    mutationFn: () => createSize(standard.trim(), value.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sizes"] });
      setValue("");
      toast.success("Size added");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add"),
  });

  const sorted = [...(data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) mutation.mutate();
        }}
        className="flex max-w-md gap-2"
      >
        <Input
          value={standard}
          onChange={(e) => setStandard(e.target.value)}
          placeholder="Standard (EU/UK/US)"
          className="w-32"
        />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value (e.g. 42)" />
        <Button type="submit" disabled={mutation.isPending || !value.trim()}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Standard</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={2}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                    No sizes yet.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.standard}</TableCell>
                    <TableCell>{s.value}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Catalog" description="Categories, genders, product types, colors and sizes" />

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="genders">Genders</TabsTrigger>
          <TabsTrigger value="types">Product Types</TabsTrigger>
          <TabsTrigger value="colors">Colors</TabsTrigger>
          <TabsTrigger value="sizes">Sizes</TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <NamedLookupTab
            queryKey="categories"
            fetcher={listCategories}
            creator={createCategory}
            label="Category"
          />
        </TabsContent>
        <TabsContent value="genders">
          <NamedLookupTab queryKey="genders" fetcher={listGenders} creator={createGender} label="Gender" />
        </TabsContent>
        <TabsContent value="types">
          <NamedLookupTab
            queryKey="product-types"
            fetcher={listProductTypes}
            creator={createProductType}
            label="Product type"
          />
        </TabsContent>
        <TabsContent value="colors">
          <ColorsTab />
        </TabsContent>
        <TabsContent value="sizes">
          <SizesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
