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
  type LookupKind,
} from "@/lib/api/catalog";
import { useLocale } from "@/lib/i18n/locale-context";
import { LookupRowActions } from "@/components/lookup-row-actions";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function NamedLookupTab({
  kind,
  queryKey,
  fetcher,
  creator,
  label,
}: {
  kind: LookupKind;
  queryKey: string;
  fetcher: () => Promise<{ id: string; name: string }[]>;
  creator: (name: string) => Promise<unknown>;
  label: string;
}) {
  const { t } = useLocale();
  const [name, setName] = React.useState("");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: fetcher });

  const mutation = useMutation({
    mutationFn: creator,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setName("");
      toast.success(t("catalog.added", { label }));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("catalog.addFailed")),
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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("catalog.newPlaceholder", { label: label.toLowerCase() })}
        />
        <Button type="submit" disabled={mutation.isPending || !name.trim()}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("common.add")}
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
                    {t("catalog.noneYet", { label: label.toLowerCase() })}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="w-full">{item.name}</TableCell>
                    <TableCell className="text-end">
                      <LookupRowActions
                        kind={kind}
                        id={item.id}
                        queryKey={queryKey}
                        saveInput={{ name: item.name }}
                        renderEdit={(value, set) => (
                          <Input
                            autoFocus
                            value={value.name}
                            onChange={(e) => set("name", e.target.value)}
                            className="h-8 w-40"
                          />
                        )}
                      />
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

function ColorsTab() {
  const { t } = useLocale();
  const [name, setName] = React.useState("");
  const [hex, setHex] = React.useState("#000000");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["colors"], queryFn: listColors });

  const mutation = useMutation({
    mutationFn: () => createColor(name.trim(), hex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colors"] });
      setName("");
      toast.success(t("catalog.colorAdded"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("catalog.addFailed")),
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
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("catalog.newColorName")} />
        <input
          type="color"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          className="h-9 w-12 rounded-md border"
        />
        <Button type="submit" disabled={mutation.isPending || !name.trim()}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("common.add")}
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
                  <TableCell className="py-6 text-center text-muted-foreground">{t("catalog.noColorsYet")}</TableCell>
                </TableRow>
              ) : (
                data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="flex w-full items-center gap-2">
                      <span
                        className="size-4 rounded-full border"
                        style={{ backgroundColor: c.hexCode ?? undefined }}
                      />
                      {c.name}
                    </TableCell>
                    <TableCell className="text-end">
                      <LookupRowActions
                        kind="color"
                        id={c.id}
                        queryKey="colors"
                        saveInput={{ name: c.name, hexCode: c.hexCode ?? "#000000" }}
                        renderEdit={(value, set) => (
                          <>
                            <Input
                              autoFocus
                              value={value.name}
                              onChange={(e) => set("name", e.target.value)}
                              className="h-8 w-32"
                            />
                            <input
                              type="color"
                              value={value.hexCode}
                              onChange={(e) => set("hexCode", e.target.value)}
                              className="h-8 w-9 rounded-md border"
                            />
                          </>
                        )}
                      />
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
  const { t } = useLocale();
  const [standard, setStandard] = React.useState("EU");
  const [value, setValue] = React.useState("");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["sizes"], queryFn: listSizes });

  const mutation = useMutation({
    mutationFn: () => createSize(standard.trim(), value.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sizes"] });
      setValue("");
      toast.success(t("catalog.sizeAdded"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("catalog.addFailed")),
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
          placeholder={t("catalog.standardPlaceholder")}
          className="w-32"
        />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("catalog.valuePlaceholder")} />
        <Button type="submit" disabled={mutation.isPending || !value.trim()}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("common.add")}
        </Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("catalog.colStandard")}</TableHead>
                <TableHead>{t("catalog.colValue")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    {t("catalog.noSizesYet")}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.standard}</TableCell>
                    <TableCell>{s.value}</TableCell>
                    <TableCell className="text-end">
                      <LookupRowActions
                        kind="size"
                        id={s.id}
                        queryKey="sizes"
                        saveInput={{ standard: s.standard, value: s.value }}
                        renderEdit={(value, set) => (
                          <>
                            <Input
                              autoFocus
                              value={value.standard}
                              onChange={(e) => set("standard", e.target.value)}
                              className="h-8 w-20"
                            />
                            <Input
                              value={value.value}
                              onChange={(e) => set("value", e.target.value)}
                              className="h-8 w-16"
                            />
                          </>
                        )}
                      />
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

export default function CatalogPage() {
  const { t } = useLocale();
  return (
    <div className="space-y-4">
      <PageHeader title={t("catalog.title")} description={t("catalog.description")} />

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">{t("catalog.tabCategories")}</TabsTrigger>
          <TabsTrigger value="genders">{t("catalog.tabGenders")}</TabsTrigger>
          <TabsTrigger value="types">{t("catalog.tabTypes")}</TabsTrigger>
          <TabsTrigger value="colors">{t("catalog.tabColors")}</TabsTrigger>
          <TabsTrigger value="sizes">{t("catalog.tabSizes")}</TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <NamedLookupTab
            kind="category"
            queryKey="categories"
            fetcher={listCategories}
            creator={createCategory}
            label={t("catalog.category")}
          />
        </TabsContent>
        <TabsContent value="genders">
          <NamedLookupTab
            kind="gender"
            queryKey="genders"
            fetcher={listGenders}
            creator={createGender}
            label={t("catalog.gender")}
          />
        </TabsContent>
        <TabsContent value="types">
          <NamedLookupTab
            kind="productType"
            queryKey="product-types"
            fetcher={listProductTypes}
            creator={createProductType}
            label={t("catalog.productType")}
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
