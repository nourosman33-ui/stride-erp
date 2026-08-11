"use client";

import * as React from "react";
import { createPortal } from "react-dom";

export type PrintVariant = "receipt" | "report";

/**
 * Renders its children into a container attached directly to <body>, hidden on
 * screen and revealed only when printing.
 *
 * Why a portal rather than print CSS over the in-page markup: receipts are
 * usually shown inside a Radix dialog, whose content box sets `transform`,
 * `max-height` and `overflow-y-auto`. A transformed ancestor becomes the
 * containing block for absolutely-positioned descendants, so the old
 * "position:absolute; inset:0" print rule anchored the receipt to the *dialog*
 * and let its overflow clip the page — which is what made printed receipts come
 * out cut off and offset. Portalling to body escapes every transform, stacking
 * context and scroll container in one move.
 */
function PrintDocument({
  children,
  variant = "receipt",
}: {
  children: React.ReactNode;
  variant?: PrintVariant;
}) {
  // document doesn't exist during SSR, so the portal only mounts client-side.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="print-document" data-print-variant={variant} aria-hidden>
      {children}
    </div>,
    document.body,
  );
}

/**
 * Shows `children` normally on screen AND queues an identical copy for the
 * printer. Rendering twice (rather than moving the node) keeps the on-screen
 * layout untouched while giving print a clean, un-nested copy.
 */
export function Printable({
  children,
  variant = "receipt",
}: {
  children: React.ReactNode;
  variant?: PrintVariant;
}) {
  return (
    <>
      {children}
      <PrintDocument variant={variant}>{children}</PrintDocument>
    </>
  );
}

/** Print-only content — never rendered on screen (e.g. a full report a page
 * only offers as a printout, with no on-screen equivalent). */
export function PrintOnly({
  children,
  variant = "report",
}: {
  children: React.ReactNode;
  variant?: PrintVariant;
}) {
  return <PrintDocument variant={variant}>{children}</PrintDocument>;
}
