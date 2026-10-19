"use client";

import React, { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { WorkspaceHeader } from "@/components/layout/WorkspaceHeader";
import { useWorkspace } from "@/context/WorkspaceContext";
import { CreateWorkspaceModal } from "@/components/workspace/CreateWorkspaceModal";
import { PageOutlet } from "@/components/navigation/PageOutlet";

export default function WorkspaceLayout() {
  const { currentWorkspace, openCreateWorkspaceModal } = useWorkspace();

  useEffect(() => {
    if (!currentWorkspace) {
      openCreateWorkspaceModal();
    }
  }, [currentWorkspace, openCreateWorkspaceModal]);

  return (
    <div className="h-screen w-full flex overflow-hidden bg-slate-100/70 dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-[calc(100vh-1.25rem)] my-2.5 mr-2.5 ml-1 sm:ml-2 bg-white dark:bg-[#182234] border border-slate-200/90 dark:border-slate-800/80 rounded-2xl sm:rounded-3xl shadow-xs overflow-hidden relative z-10 transition-colors duration-200">
        <WorkspaceHeader />
        <main className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-[#131c2d] transition-colors duration-200">
          <PageOutlet />
        </main>
      </div>
      <CreateWorkspaceModal />
    </div>
  );
}
