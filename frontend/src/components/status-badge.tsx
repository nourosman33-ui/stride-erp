import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n/locale-context";
import type { PoStatus } from "@/lib/api/types";

const PO_VARIANT: Record<PoStatus, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  draft: "outline",
  pending_approval: "warning",
  approved: "default",
  partially_received: "secondary",
  received: "success",
  cancelled: "destructive",
};

export function PoStatusBadge({ status }: { status: PoStatus }) {
  const { t } = useLocale();
  return <Badge variant={PO_VARIANT[status]}>{t(`status.${status}`)}</Badge>;
}

const MOVEMENT_VARIANT: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  "Fast Moving": "success",
  "Slow Moving": "warning",
  "Dead Stock": "destructive",
  "No Stock Received": "outline",
};

export function MovementStatusBadge({ status }: { status: string }) {
  return <Badge variant={MOVEMENT_VARIANT[status] ?? "outline"}>{status}</Badge>;
}
