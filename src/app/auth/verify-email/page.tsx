import AuthShell from "@/components/auth/AuthShell";
import AuthCard from "@/components/auth/AuthCard";
import EmailSentCard from "@/components/auth/EmailSentCard";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";

  return (
    <AuthShell>
      <AuthCard>
        <EmailSentCard
          email={email}
          resendType="signup"
          changeEmailHref="/auth/signup"
          heading="Verify your email"
          body={
            <>
              We sent a verification link to <span className="text-text">{email}</span>. Click it to start using
              PhotoWhisperer.
            </>
          }
        />
      </AuthCard>
    </AuthShell>
  );
}
