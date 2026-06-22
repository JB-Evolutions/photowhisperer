import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import ResetRequestForm from "@/components/auth/ResetRequestForm";

export default function ResetPage() {
  return (
    <AuthShell>
      <AuthCard>
        <ResetRequestForm />
      </AuthCard>
    </AuthShell>
  );
}
