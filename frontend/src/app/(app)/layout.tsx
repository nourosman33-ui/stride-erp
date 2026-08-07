"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { isCashierOnly, isPathAllowedForCashier } from "@/lib/access-control";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
      return;
    }
    // Cashiers are POS-only — this is the real gate for direct URL entry; hidden nav
    // links (nav-items.ts) only stop someone from clicking there, not from typing the URL.
    if (user && isCashierOnly(user.roles) && !isPathAllowedForCashier(pathname)) {
      router.replace("/pos");
    }
  }, [isLoading, user, pathname, router]);

  const blockedForCashier = !!user && isCashierOnly(user.roles) && !isPathAllowedForCashier(pathname);

  if (isLoading || !user || blockedForCashier) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <AppTopbar />
        <main className="flex-1 overflow-x-hidden bg-muted/20 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
