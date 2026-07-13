import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import ResetRequestForm from "@/components/auth/ResetRequestForm";
import { NOINDEX } from "@/lib/seo";

export const metadata: Metadata = {
  robots: NOINDEX,
};

export default function ResetPage() {
  return (
    <AuthShell>
      <AuthCard>
        <ResetRequestForm />
      </AuthCard>
    </AuthShell>
  );
}
