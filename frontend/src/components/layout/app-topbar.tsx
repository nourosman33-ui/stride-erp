"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Globe,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package2,
  Palette,
  Store as StoreIcon,
  Sun,
  User as UserIcon,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useActiveStore } from "@/lib/store-context";
import { useLocale, type Locale, type TranslationKey } from "@/lib/i18n/locale-context";
import {
  ACCENTS,
  ACCENT_SWATCH,
  SIGNATURE_ACCENTS,
  useTheme,
  type Accent,
  type ThemeMode,
} from "@/lib/theme-context";
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

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
];

function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={t("topbar.language")}>
          <Globe className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem key={lang.value} onClick={() => setLocale(lang.value)}>
            {lang.label}
            {locale === lang.value && <Check className="ms-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const MODE_OPTIONS: { value: ThemeMode; labelKey: TranslationKey; icon: typeof Sun }[] = [
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
  { value: "system", labelKey: "theme.system", icon: Monitor },
];

const ACCENT_LABEL: Record<Accent, TranslationKey> = {
  graphite: "theme.accentGraphite",
  blue: "theme.accentBlue",
  emerald: "theme.accentEmerald",
  violet: "theme.accentViolet",
  amber: "theme.accentAmber",
  rose: "theme.accentRose",
  aurora: "theme.accentAurora",
  sunset: "theme.accentSunset",
  ocean: "theme.accentOcean",
  midnight: "theme.accentMidnight",
};

function ThemeSwitcher() {
  const { t } = useLocale();
  const { mode, setMode, accent, setAccent, resolvedMode } = useTheme();
  const ActiveIcon = mode === "system" ? Monitor : resolvedMode === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={t("theme.title")}>
          <ActiveIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("theme.appearance")}</DropdownMenuLabel>
        {MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <DropdownMenuItem key={opt.value} onClick={() => setMode(opt.value)}>
              <Icon className="size-4" />
              {t(opt.labelKey)}
              {mode === opt.value && <Check className="ms-auto size-4" />}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <Palette className="size-4" />
          {t("theme.accent")}
        </DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 p-1">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAccent(a)}
              title={t(ACCENT_LABEL[a])}
              aria-label={t(ACCENT_LABEL[a])}
              aria-pressed={accent === a}
              className={`flex flex-col items-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] transition hover:bg-accent ${
                accent === a ? "bg-accent font-medium" : ""
              }`}
            >
              <span
                className="flex size-5 items-center justify-center rounded-full border"
                style={{ background: ACCENT_SWATCH[a] }}
              >
                {accent === a && <Check className="size-3 text-white drop-shadow" />}
              </span>
              {t(ACCENT_LABEL[a])}
            </button>
          ))}
        </div>
        <DropdownMenuLabel className="flex items-center gap-2 pt-0 text-xs font-normal text-muted-foreground">
          {t("theme.signature")}
        </DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-1 p-1 pt-0">
          {SIGNATURE_ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAccent(a)}
              title={t(ACCENT_LABEL[a])}
              aria-label={t(ACCENT_LABEL[a])}
              aria-pressed={accent === a}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition hover:bg-accent ${
                accent === a ? "bg-accent font-medium" : ""
              }`}
            >
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full border"
                style={{ background: ACCENT_SWATCH[a] }}
              >
                {accent === a && <Check className="size-3 text-white drop-shadow" />}
              </span>
              {t(ACCENT_LABEL[a])}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  const { t, dir } = useLocale();
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
        <SheetContent side={dir === "rtl" ? "right" : "left"} className="w-64 p-0">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2 text-start">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Package2 className="size-4" />
              </div>
              {t("nav.appName")}
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
          <span>{t("topbar.loadingStores")}</span>
        ) : stores.length === 0 ? (
          <span>{t("topbar.noStoreConfigured")}</span>
        ) : (
          <Select value={activeStoreId ?? undefined} onValueChange={setActiveStoreId}>
            <SelectTrigger size="sm" className="w-[200px] border-none shadow-none">
              <SelectValue placeholder={t("topbar.selectStore")} />
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

      <div className="ms-auto flex items-center gap-3">
        {user && (
          <Badge variant="outline" className="hidden sm:inline-flex">
            {user.roles.map((role) => t(`roles.${role}`)).join(", ")}
          </Badge>
        )}
        <ThemeSwitcher />
        <LanguageSwitcher />
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
              {t("topbar.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
