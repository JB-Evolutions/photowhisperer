import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import ResetConfirmForm from "@/components/auth/ResetConfirmForm";
import { NOINDEX } from "@/lib/seo";

export const metadata: Metadata = {
  robots: NOINDEX,
};

export default function ResetConfirmPage() {
  return (
    <AuthShell>
      <AuthCard>
        <ResetConfirmForm />
      </AuthCard>
    </AuthShell>
  );
}
