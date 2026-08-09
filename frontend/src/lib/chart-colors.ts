import type React from "react";

// Validated categorical / status palette (see dataviz skill, references/palette.md).
// Fixed hue order — assign by position, never cycle or reassign per-filter.
export const CATEGORICAL = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
] as const;

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/**
 * Chart furniture, resolved from CSS variables so axes and gridlines follow the active
 * light/dark theme instead of being baked to light-mode ink. Safe as SVG presentation
 * attributes (`stroke={CHART_INK.muted}`) — SVG accepts var() the same as CSS does.
 */
export const CHART_INK = {
  primary: "var(--chart-ink-primary)",
  secondary: "var(--chart-ink-secondary)",
  muted: "var(--chart-ink-muted)",
  gridline: "var(--chart-ink-gridline)",
  baseline: "var(--chart-ink-baseline)",
};

/**
 * Recharts' default tooltip is a hardcoded white box, which reads as a bright card
 * floating on a dark chart. Pointing it at the popover tokens makes it match every
 * other surface in whichever theme is active.
 */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  fontSize: 12,
  borderRadius: 8,
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  color: "var(--color-popover-foreground)",
};

export const CHART_TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "var(--color-popover-foreground)",
};

export const PO_STATUS_COLOR: Record<string, string> = {
  draft: CHART_INK.muted,
  pending_approval: STATUS.warning,
  approved: CATEGORICAL[0],
  partially_received: CATEGORICAL[3],
  received: STATUS.good,
  cancelled: STATUS.critical,
};

export const MOVEMENT_STATUS_COLOR: Record<string, string> = {
  "Fast Moving": STATUS.good,
  "Slow Moving": STATUS.warning,
  "Dead Stock": STATUS.critical,
  "No Stock Received": CHART_INK.muted,
};
