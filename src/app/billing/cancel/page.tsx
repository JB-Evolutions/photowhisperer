import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import CancelView from "./CancelView";
import { NOINDEX } from "@/lib/seo";

export const metadata = {
  title: "Purchase canceled · PhotoWhisperer",
  robots: NOINDEX,
};

export default function CancelPage() {
  return (
    <AuthShell>
      <AuthCard>
        <CancelView />
      </AuthCard>
    </AuthShell>
  );
}
