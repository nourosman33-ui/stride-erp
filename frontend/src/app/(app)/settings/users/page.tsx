"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createUser, listUsers } from "@/lib/api/users";
import { useAuth } from "@/lib/auth-context";
import { useLocale, type TranslationKey } from "@/lib/i18n/locale-context";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Role } from "@/lib/api/types";

const ROLE_OPTIONS: Role[] = ["owner", "manager", "cashier", "inventory_clerk", "accountant", "viewer"];

const schema = z.object({
  fullName: z.string().min(1, "Required"),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8, "At least 8 characters"),
  roleNames: z.array(z.string()).min(1, "Select at least one role"),
});
type FormValues = z.infer<typeof schema>;

function NewUserDialog() {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", phone: "", password: "", roleNames: [] },
  });

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("settingsUsers.userCreated"));
      setOpen(false);
      form.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("settingsUsers.createFailed")),
  });

  const selectedRoles = form.watch("roleNames");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {t("settingsUsers.newUser")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settingsUsers.newDialogTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settingsUsers.fullName")}</FormLabel>
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settingsUsers.email")}</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
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
                    <FormLabel>{t("settingsUsers.phoneOptional")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settingsUsers.tempPassword")}</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roleNames"
              render={() => (
                <FormItem>
                  <FormLabel>{t("settingsUsers.roles")}</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_OPTIONS.map((role) => (
                      <label key={role} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedRoles.includes(role)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...selectedRoles, role]
                              : selectedRoles.filter((r) => r !== role);
                            form.setValue("roleNames", next, { shouldValidate: true });
                          }}
                        />
                        {t(`roles.${role}`)}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("settingsUsers.createUser")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersSettingsPage() {
  const { hasRole } = useAuth();
  const { t } = useLocale();
  const canManage = hasRole("owner", "manager");

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    enabled: canManage,
  });

  if (!canManage) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("settingsUsers.title")} description={t("settingsUsers.description")} />
        <Alert>
          <AlertTitle>{t("settingsUsers.restrictedTitle")}</AlertTitle>
          <AlertDescription>{t("settingsUsers.restrictedDesc")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("settingsUsers.title")} description={t("settingsUsers.description")} actions={<NewUserDialog />} />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settingsUsers.colName")}</TableHead>
              <TableHead>{t("settingsUsers.colEmail")}</TableHead>
              <TableHead>{t("settingsUsers.colRoles")}</TableHead>
              <TableHead>{t("settingsUsers.colStatus")}</TableHead>
              <TableHead>{t("settingsUsers.colJoined")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !users || users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {t("settingsUsers.noUsers")}
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.fullName}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell className="flex flex-wrap gap-1">
                    {(u.userRoles ?? []).map((ur) => (
                      <Badge key={ur.id} variant="secondary">
                        {t(`roles.${ur.role.name}` as TranslationKey)}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? "success" : "outline"}>
                      {u.isActive ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(u.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
