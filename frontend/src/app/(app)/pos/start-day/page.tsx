import { redirect } from "next/navigation";

/**
 * Start Day and End Day are now two ends of one business session, handled together
 * on /pos/session. This route stays as a redirect so existing links, bookmarks and
 * muscle memory keep working rather than 404ing.
 */
export default function StartDayRedirect() {
  redirect("/pos/session");
}
