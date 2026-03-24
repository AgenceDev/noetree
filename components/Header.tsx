"use client";
import { useStoreUserEffect } from "@/hooks/useStoreUserEffect";
import ConditionChecker from "@/components/helpers/ConditionChecker";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function Header() {
  const { isLoading, isAuthenticated } = useStoreUserEffect();
  return (
    <header className="flex justify-between items-center p-4 gap-4 h-16 shrink-0 bg-background">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
      </div>
      <div className="flex items-center gap-4">
        <ConditionChecker condition={!isLoading}>
          <ConditionChecker condition={isAuthenticated}>
            <UserButton />
          </ConditionChecker>
          <ConditionChecker condition={!isAuthenticated}>
            <SignInButton />
            <SignUpButton />
          </ConditionChecker>
        </ConditionChecker>
      </div>
    </header>
  );
}
