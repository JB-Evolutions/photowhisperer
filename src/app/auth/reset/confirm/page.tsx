import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import ResetConfirmForm from "@/components/auth/ResetConfirmForm";

export default function ResetConfirmPage() {
  return (
    <AuthShell>
      <AuthCard>
        <ResetConfirmForm />
      </AuthCard>
    </AuthShell>
  );
}
