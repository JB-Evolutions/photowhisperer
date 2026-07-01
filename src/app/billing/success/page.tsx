import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import SuccessView from "./SuccessView";

export const metadata = { title: "Purchase complete · PhotoWhisperer" };

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
