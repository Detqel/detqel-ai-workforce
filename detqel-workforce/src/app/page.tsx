"use client";

import { LoginForm } from "@/components/Login/LoginForm";
import WorkspaceLayout from "@/components/layout/WorkspaceLayout";
import { NavigationProvider } from "@/context/NavigationContext";
import { useWorkspace } from "@/context/WorkspaceContext";

export default function AppPage() {
  const { user, isLoading } = useWorkspace();

  return isLoading ? (
    <div className="h-screen w-full flex items-center justify-center bg-white dark:bg-[#0f172a]">
      <div className="w-8 h-8 rounded-full border-2 border-[#8a2be2] dark:border-[#FFA500] border-t-transparent animate-spin" />
    </div>
  ) : user ? (
    <NavigationProvider key={user.id}>
      <WorkspaceLayout />
    </NavigationProvider>
  ) : (
    <main className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-10 bg-[#f8f9fc] text-slate-900 selection:bg-[#8a2be2] selection:text-white">
      <div className="w-full max-w-[1140px] mx-auto">
        <LoginForm />
      </div>
    </main>
  );
}
