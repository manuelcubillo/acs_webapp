/**
 * /settings — Root redirect
 *
 * The settings root immediately redirects to the first sub-page (/settings/account).
 * The layout.tsx handles authentication and renders the secondary nav.
 */

import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/account");
}
