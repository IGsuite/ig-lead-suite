import { redirect } from "next/navigation";

/** Legacy path — Ads live at /creatives. */
export default function AdsRedirectPage() {
  redirect("/creatives");
}
