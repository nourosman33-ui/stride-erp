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

export const CHART_INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
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
