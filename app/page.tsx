import { redirect } from "next/navigation";
import { getSessionProfile } from "../lib/auth/session";

export default async function RootPage() {
  const profile = await getSessionProfile();
  redirect(profile ? "/dashboard" : "/login");
}
