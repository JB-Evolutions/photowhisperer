import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import CancelView from "./CancelView";

export const metadata = { title: "Purchase canceled · PhotoWhisperer" };

export default function CancelPage() {
  return (
    <AuthShell>
      <AuthCard>
        <CancelView />
      </AuthCard>
    </AuthShell>
  );
}
