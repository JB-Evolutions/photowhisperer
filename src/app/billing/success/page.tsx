import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import SuccessView from "./SuccessView";
import { NOINDEX } from "@/lib/seo";

export const metadata = {
  title: "Purchase complete · PhotoWhisperer",
  robots: NOINDEX,
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; pack?: string }>;
}) {
  const { type, pack } = await searchParams;
  return (
    <AuthShell>
      <AuthCard>
        <SuccessView type={type} pack={pack} />
      </AuthCard>
    </AuthShell>
  );
}
