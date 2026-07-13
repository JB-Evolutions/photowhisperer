import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import AccountSettings from "./AccountSettings";
import { NOINDEX } from "@/lib/seo";

export const metadata = { title: "Account · PhotoWhisperer", robots: NOINDEX };

export default async function AccountPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");
  return <AccountSettings email={user.email ?? ""} newEmail={user.new_email ?? null} />;
}
