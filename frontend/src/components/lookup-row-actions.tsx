"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  deleteLookup,
  getLookupUsage,
  updateLookup,
  type LookupKind,
} from "@/lib/api/catalog";
import { useLocale } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Rename + delete for a single catalog lookup row (category / gender / type / color / size).
 * Delete asks the backend how many products still use the value first — these tables have
 * no isActive flag to fall back on, so an in-use value simply cannot be removed, and the
 * dialog says why with a number rather than a generic failure.
 */
export function LookupRowActions({
  kind,
  id,
  queryKey,
  renderEdit,
  onSaved,
  saveInput,
}: {
  kind: LookupKind;
  id: string;
  /** Query key(s) to invalidate after a successful edit or delete. */
  queryKey: string;
  /** Editable fields shown inline when editing — caller owns the field layout. */
  renderEdit: (value: Record<string, string>, set: (k: string, v: string) => void) => React.ReactNode;
  /** Current values to seed the edit form. */
  saveInput: Record<string, string>;
  onSaved?: () => void;
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [form, setForm] = React.useState<Record<string, string>>(saveInput);

  React.useEffect(() => {
    if (editing) setForm(saveInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["lookup-usage", kind, id],
    queryFn: () => getLookupUsage(kind, id),
    enabled: deleteOpen,
  });

  const saveMutation = useMutation({
    mutationFn: () => updateLookup(kind, id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setEditing(false);
      onSaved?.();
      toast.success(t("catalog.updated"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("catalog.updateFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLookup(kind, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setDeleteOpen(false);
      toast.success(t("catalog.deleted"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("catalog.deleteFailed")),
  });

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        {renderEdit(form, (k, v) => setForm((f) => ({ ...f, [k]: v })))}
        <Button
          size="icon"
          className="size-7 shrink-0"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => setEditing(false)}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(true)}>
        <Pencil className="size-3.5" />
      </Button>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 text-destructive">
            <Trash2 className="size-3.5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("catalog.deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          {usageLoading || !usage ? (
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          ) : usage.canDelete ? (
            <p className="text-sm text-muted-foreground">{t("catalog.deleteSafe")}</p>
          ) : (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              {t("catalog.deleteBlocked", { count: usage.inUseBy })}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!usage?.canDelete || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
