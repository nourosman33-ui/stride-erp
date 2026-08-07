import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  tone?: "default" | "warning" | "critical";
}) {
  return (
    <Card className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              tone === "warning" && "text-warning",
              tone === "critical" && "text-destructive",
            )}
          >
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary",
            tone === "warning" && "bg-gradient-to-br from-warning/25 to-warning/10 text-warning",
            tone === "critical" && "bg-gradient-to-br from-destructive/20 to-destructive/5 text-destructive",
          )}
        >
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}
