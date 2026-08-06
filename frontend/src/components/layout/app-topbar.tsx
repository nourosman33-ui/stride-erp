"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Package2, Store as StoreIcon, User as UserIcon } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle, SheetTrigger, SheetHeader } from "@/components/ui/sheet";
import { AppSidebarNav } from "./app-sidebar";
import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/format";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppTopbar() {
  const { user, logout } = useAuth();
  const { stores, activeStoreId, setActiveStoreId, isLoading } = useActiveStore();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2 text-left">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Package2 className="size-4" />
              </div>
              STRIDE ERP
            </SheetTitle>
          </SheetHeader>
          <div onClick={() => setMobileOpen(false)}>
            <AppSidebarNav />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StoreIcon className="size-4" />
        {isLoading ? (
          <span>Loading stores…</span>
        ) : stores.length === 0 ? (
          <span>No store configured yet</span>
        ) : (
          <Select value={activeStoreId ?? undefined} onValueChange={setActiveStoreId}>
            <SelectTrigger size="sm" className="w-[200px] border-none shadow-none">
              <SelectValue placeholder="Select a store" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {user && (
          <Badge variant="outline" className="hidden sm:inline-flex">
            {user.roles.map(titleCase).join(", ")}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="size-7">
                <AvatarFallback>{user ? initials(user.fullName) : <UserIcon className="size-4" />}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{user?.fullName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
