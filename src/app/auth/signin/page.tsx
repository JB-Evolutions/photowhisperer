import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import SigninForm from "@/components/auth/SigninForm";

function getInitialBanner(error: string | undefined): string | null {
  if (!error) return null;
  if (error === "link_expired") return "Link expired. Try again.";
  return "Something went wrong. Please try again.";
}

function getDeletedBanner(deleted: string | undefined): string | null {
  if (deleted !== "true") return null;
  return "Your account has been scheduled for deletion. Sign back in within 7 days to recover it.";
}

export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const params = await searchParams;
  const initialBanner = getInitialBanner(params.error);
  const deletedBanner = getDeletedBanner(params.deleted);

  return (
    <AuthShell>
      <AuthCard>
        <h1 className="font-display text-2xl text-text">Welcome back</h1>
        <SigninForm initialBanner={deletedBanner ?? initialBanner} />
        <p className="text-center text-sm text-text-muted">
          No account?{" "}
          <Link href="/auth/signup" className="text-text underline hover:text-accent">
            Sign up
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
