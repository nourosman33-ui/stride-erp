import { redirect } from "next/navigation";

/**
 * See start-day/page.tsx — the session page at /pos/session now owns both ends of
 * the trading day, including the printable summary this page used to produce
 * (now scoped to the session rather than the calendar date).
 */
export default function EndDayRedirect() {
  redirect("/pos/session");
}
