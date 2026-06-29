/**
 * /styleguide — dev-only design system surface
 *
 * Returns 404 in production so the route never ships to end users.
 * In development / preview it renders the StyleguideClient with every
 * primitive ramp, semantic token, state token, and shadcn primitive demo.
 *
 * Public so anyone running the dev server can open it without auth — it
 * exposes no tenant data.
 */

import { notFound } from "next/navigation";
import StyleguideClient from "./StyleguideClient";

export const dynamic = "force-dynamic";

export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <StyleguideClient />;
}
