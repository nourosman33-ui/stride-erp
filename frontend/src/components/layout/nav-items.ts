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
} from "lucide-react";
import type { Role } from "@/lib/api/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Inventory",
    items: [
      { label: "Products", href: "/inventory/products", icon: Package },
      { label: "Catalog", href: "/inventory/catalog", icon: Tags },
      { label: "Stock on Hand", href: "/inventory/stock", icon: Warehouse },
      { label: "Adjustments", href: "/inventory/adjustments", icon: ClipboardList },
      { label: "Reorder Alerts", href: "/inventory/reorder-alerts", icon: AlertTriangle },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Suppliers", href: "/purchasing/suppliers", icon: Truck },
      { label: "Purchase Orders", href: "/purchasing/orders", icon: ShoppingCart },
      { label: "Purchase Returns", href: "/purchasing/returns", icon: Undo2 },
    ],
  },
  {
    label: "Sales",
    items: [{ label: "Point of Sale", href: "/pos", icon: ScanBarcode }],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: BarChart3 }],
  },
  {
    label: "Settings",
    items: [
      { label: "Store Profile", href: "/settings/store", icon: Store, roles: ["owner", "manager"] },
      { label: "Users", href: "/settings/users", icon: Users, roles: ["owner", "manager"] },
    ],
  },
];
