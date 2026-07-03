import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { GRACE_PERIOD_DAYS } from "@/lib/account-deletion";
import { parseDbTimestamp } from "@/lib/date";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import RestoreButton from "./RestoreButton";

export const metadata = { title: "Recover account · PhotoWhisperer" };

export default async function RestorePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: profile } = await supabase
    .from("users")
    .select("deleted_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const deletedAt =
    (profile as { deleted_at: string | null } | null)?.deleted_at ?? null;

  // Active user hit the URL directly — nothing to recover.
  if (!deletedAt) redirect("/app");

  const deletionDate = new Date(
    parseDbTimestamp(deletedAt).getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  );
  const formattedDate = deletionDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <AuthShell>
      <AuthCard>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl text-text">
            Account scheduled for deletion
          </h1>
          <p className="text-sm text-text-muted">
            Your account will be permanently deleted on{" "}
            <span className="font-medium text-text">{formattedDate}</span>. You
            can recover it any time before then.
          </p>
          <p className="text-sm text-text-muted">
            Recovering restores full access to your account and all your data.
          </p>
        </div>
        <RestoreButton />
        <p className="text-sm text-text-muted">
          If you don&rsquo;t recover your account, your data will be permanently
          removed after the grace period ends.
        </p>
      </AuthCard>
    </AuthShell>
  );
}
