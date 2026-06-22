import type { ReactNode } from "react";
import Logo from "@/components/shared/Logo";

export default function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-6">
      <Logo />
      {children}
    </div>
  );
}
