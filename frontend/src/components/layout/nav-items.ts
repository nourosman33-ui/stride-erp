import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  Tags,
  Warehouse,
  ClipboardList,
  Truck,
  ShoppingCart,
  Undo2,
  ScanBarcode,
  BarChart3,
  Store,
  Users,
  AlertTriangle,
  Contact,
  Receipt,
  Bot,
} from "lucide-react";
import type { Role } from "@/lib/api/types";
import type { TranslationKey } from "@/lib/i18n/locale-context";

export interface NavItem {
  labelKey: TranslationKey;
  href: string;
  icon: LucideIcon;
  roles?: Role[];
}

export interface NavGroup {
  labelKey: TranslationKey;
  items: NavItem[];
}

// Cashiers are POS-only (stock availability + checkout + invoices) — every item below except
// Point of Sale is scoped to back-office roles. This mirrors the backend's own @Roles guards
// (see ProductsController/SuppliersController/PurchasingController/InventoryController), so
// hiding a link here is a UX nicety, not the actual security boundary.
const BACK_OFFICE_ROLES: Role[] = ["owner", "manager", "inventory_clerk", "accountant"];

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.groupOverview",
    items: [{ labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, roles: BACK_OFFICE_ROLES }],
  },
  {
    labelKey: "nav.groupInventory",
    items: [
      { labelKey: "nav.products", href: "/inventory/products", icon: Package, roles: BACK_OFFICE_ROLES },
      { labelKey: "nav.catalog", href: "/inventory/catalog", icon: Tags, roles: BACK_OFFICE_ROLES },
      { labelKey: "nav.stock", href: "/inventory/stock", icon: Warehouse, roles: BACK_OFFICE_ROLES },
      { labelKey: "nav.adjustments", href: "/inventory/adjustments", icon: ClipboardList, roles: BACK_OFFICE_ROLES },
      { labelKey: "nav.reorderAlerts", href: "/inventory/reorder-alerts", icon: AlertTriangle, roles: BACK_OFFICE_ROLES },
    ],
  },
  {
    labelKey: "nav.groupPurchasing",
    items: [
      { labelKey: "nav.suppliers", href: "/purchasing/suppliers", icon: Truck, roles: BACK_OFFICE_ROLES },
      { labelKey: "nav.purchaseOrders", href: "/purchasing/orders", icon: ShoppingCart, roles: BACK_OFFICE_ROLES },
      { labelKey: "nav.purchaseReturns", href: "/purchasing/returns", icon: Undo2, roles: BACK_OFFICE_ROLES },
    ],
  },
  {
    labelKey: "nav.groupSales",
    items: [
      { labelKey: "nav.pos", href: "/pos", icon: ScanBarcode },
      { labelKey: "nav.salesHistory", href: "/sales", icon: Receipt, roles: BACK_OFFICE_ROLES },
    ],
  },
  {
    labelKey: "nav.groupCustomers",
    items: [{ labelKey: "nav.customers", href: "/customers", icon: Contact, roles: BACK_OFFICE_ROLES }],
  },
  {
    labelKey: "nav.groupInsights",
    items: [
      { labelKey: "nav.reports", href: "/reports", icon: BarChart3, roles: BACK_OFFICE_ROLES },
      { labelKey: "nav.aiAssistant", href: "/ai", icon: Bot, roles: ["owner"] },
    ],
  },
  {
    labelKey: "nav.groupSettings",
    items: [
      { labelKey: "nav.storeProfile", href: "/settings/store", icon: Store, roles: ["owner", "manager"] },
      { labelKey: "nav.users", href: "/settings/users", icon: Users, roles: ["owner", "manager"] },
    ],
  },
];
