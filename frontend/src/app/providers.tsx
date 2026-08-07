"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "@/lib/auth-context";
import { ActiveStoreProvider } from "@/lib/store-context";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AuthProvider>
          <ActiveStoreProvider>
            {children}
            <Toaster position="top-right" richColors />
          </ActiveStoreProvider>
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
