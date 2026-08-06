"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FlatVariant } from "@/lib/hooks/use-variant-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export function VariantPicker({
  variants,
  value,
  onChange,
  placeholder = "Search by product, color, size or barcode…",
  disabled,
}: {
  variants: FlatVariant[];
  value: string | null;
  onChange: (variantId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = variants.find((v) => v.variantId === value) ?? null;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? variants.filter((v) =>
          [v.productName, v.colorName, v.sizeLabel, v.barcode].some((field) =>
            field.toLowerCase().includes(q),
          ),
        )
      : variants;
    return pool.slice(0, 50);
  }, [variants, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              {selected.productName} — {selected.colorName} / {selected.sizeLabel}{" "}
              <span className="text-muted-foreground">({selected.barcode})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to filter…"
            className="h-8 border-none px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="h-64">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No variants found.</p>
          ) : (
            <div className="p-1">
              {filtered.map((v) => (
                <button
                  key={v.variantId}
                  type="button"
                  onClick={() => {
                    onChange(v.variantId);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    v.variantId === value && "bg-accent/60",
                  )}
                >
                  <span className="truncate">
                    {v.productName} — {v.colorName} / {v.sizeLabel}
                    <span className="ml-1.5 text-xs text-muted-foreground">{v.barcode}</span>
                  </span>
                  {v.variantId === value && <Check className="size-4 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
