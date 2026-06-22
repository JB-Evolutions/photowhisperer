import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import SignupForm from "@/components/auth/SignupForm";
import { TIER_DISPLAY_NAMES, type Tier } from "@/lib/quota";

function getBannerTier(value: string | string[] | undefined): Tier | null {
  const tier = Array.isArray(value) ? value[0] : value;
  return tier === "portrait" || tier === "studio" ? tier : null;
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const bannerTier = getBannerTier(params.tier);

  return (
    <AuthShell>
      <AuthCard>
        {bannerTier && (
          <p className="rounded-[10px] border border-border-accent bg-surface-2 px-4 py-2.5 text-sm text-text-muted">
            Starting with <span className="text-accent">{TIER_DISPLAY_NAMES[bannerTier]}</span> — payment after this step
          </p>
        )}
        <h1 className="font-display text-2xl text-text">Create your account</h1>
        <SignupForm />
        <p className="text-center text-sm text-text-muted">
          Already have an account?{" "}
          <Link href="/auth/signin" className="text-text underline hover:text-accent">
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
