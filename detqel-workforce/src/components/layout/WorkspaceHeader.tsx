"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, Plus, Trash2, Pencil } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { WorkspaceSummary } from "@/lib/api";
import { EditWorkspaceModal } from "@/components/workspace/EditWorkspaceModal";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

export const WorkspaceHeader: React.FC = () => {
  const {
    currentWorkspace,
    workspaces,
    switchWorkspace,
    deleteWorkspace,
    openCreateWorkspaceModal,
  } = useWorkspace();
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceSummary | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<WorkspaceSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        switcherRef.current &&
        !switcherRef.current.contains(event.target as Node)
      ) {
        setWorkspaceSwitcherOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const workspaceInitial =
    isMounted && currentWorkspace?.name ? currentWorkspace.name[0].toUpperCase() : "W";
  const workspaceName =
    isMounted && currentWorkspace?.name ? currentWorkspace.name : "Select Workspace";
  const workspaceIndustry =
    isMounted && currentWorkspace?.industry ? currentWorkspace.industry : "Business Workspace";

  return (
    <>
      <header className="sticky top-0 z-20 w-full h-15 bg-white dark:bg-[#182234] border-b border-slate-100 dark:border-slate-800/80 px-6 flex items-center justify-between select-none shrink-0 gap-4 transition-colors">
        {/* Global Workspace Selector on the LEFT */}
        <div className="relative shrink-0" ref={switcherRef}>
          <button
            type="button"
            onClick={() => setWorkspaceSwitcherOpen((prev) => !prev)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#151f32] hover:bg-slate-100/90 dark:hover:bg-[#1d2a42] border border-slate-200/90 dark:border-slate-700/60 transition-all cursor-pointer group shadow-2xs"
            aria-label="Workspace switcher"
          >
            <div
              suppressHydrationWarning
              className="w-7 h-7 shrink-0 rounded-lg bg-[#8a2be2] dark:bg-[#FFA500] text-white dark:text-slate-950 flex items-center justify-center font-bold text-xs shadow-xs"
            >
              {workspaceInitial}
            </div>
            <div className="flex flex-col text-left min-w-0 max-w-[140px] sm:max-w-[180px]">
              <span
                suppressHydrationWarning
                className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#8a2be2] dark:group-hover:text-[#FFA500] transition-colors truncate"
              >
                {workspaceName}
              </span>
              <span
                suppressHydrationWarning
                className="text-[10px] text-slate-500 dark:text-slate-400 truncate"
              >
                {workspaceIndustry}
              </span>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 dark:text-[#FFA500] group-hover:text-slate-600 dark:group-hover:text-[#FFA500] transition-transform ${
                workspaceSwitcherOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Workspace Switcher Popover */}
          {workspaceSwitcherOpen && (
            <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                Workspaces ({workspaces.length})
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1 py-1">
                {workspaces.map((ws) => {
                  const isSelected = currentWorkspace?.id === ws.id;
                  return (
                    <div
                      key={ws.id}
                      onClick={() => {
                        switchWorkspace(ws.id);
                        setWorkspaceSwitcherOpen(false);
                      }}
                      className={`w-full group flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#8a2be2]/10 dark:bg-[#FFA500]/20 text-[#8a2be2] dark:text-[#FFA500] font-bold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#151f32]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                        <div className="w-6 h-6 rounded-md bg-[#8a2be2]/20 dark:bg-[#FFA500]/20 text-[#8a2be2] dark:text-[#FFA500] flex items-center justify-center font-bold text-[10px] shrink-0">
                          {ws.name[0]?.toUpperCase() || "W"}
                        </div>
                        <div className="flex flex-col truncate min-w-0">
                          <span className="truncate font-semibold">{ws.name}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-400 truncate font-normal">
                            {ws.industry || "Workspace"}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons: When user is currently in this workspace, editing or deleting is NOT allowed.
                          For other workspaces, user can edit (replace tick with edit) and delete. */}
                      {!isSelected && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title={`Edit ${ws.name}`}
                            aria-label={`Edit workspace ${ws.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingWorkspace(ws);
                              setWorkspaceSwitcherOpen(false);
                            }}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-[#8a2be2] dark:hover:text-[#FFA500] hover:bg-purple-100/70 dark:hover:bg-[#FFA500]/15 opacity-60 group-hover:opacity-100 transition-all cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title={`Delete ${ws.name}`}
                            aria-label={`Delete workspace ${ws.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setWorkspaceToDelete(ws);
                              setDeleteError(null);
                              setWorkspaceSwitcherOpen(false);
                            }}
                            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100/70 dark:hover:bg-red-950/50 opacity-60 group-hover:opacity-100 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceSwitcherOpen(false);
                    openCreateWorkspaceModal();
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-xl text-xs font-semibold text-[#8a2be2] dark:text-[#FFA500] hover:bg-[#8a2be2]/10 dark:hover:bg-[#FFA500]/20 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Workspace</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Search Bar Section on the RIGHT */}
        <div className="flex-1 max-w-md sm:max-w-lg ml-auto">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-slate-400 dark:text-[#FFA500] pointer-events-none" />
            <input
              type="text"
              placeholder="Search or ask anything about your business..."
              className="w-full bg-slate-50 dark:bg-[#151f32] border border-slate-200/80 dark:border-slate-700/60 rounded-xl pl-10 pr-16 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-[#8a2be2] dark:focus:border-[#FFA500] focus:bg-white dark:focus:bg-[#182234] focus:ring-1 focus:ring-[#8a2be2]/30 dark:focus:ring-[#FFA500]/30 transition-all"
            />
            <div className="absolute right-3 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#182234] text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Ctrl K
            </div>
          </div>
        </div>
      </header>

      {/* Edit Workspace Modal */}
      <EditWorkspaceModal
        workspace={editingWorkspace}
        isOpen={Boolean(editingWorkspace)}
        onClose={() => setEditingWorkspace(null)}
      />

      {/* Delete Workspace Confirmation Modal */}
      {workspaceToDelete && (
        <ConfirmationModal
          isOpen={Boolean(workspaceToDelete)}
          onClose={() => {
            if (!isDeleting) {
              setWorkspaceToDelete(null);
              setDeleteError(null);
            }
          }}
          onConfirm={async () => {
            if (!workspaceToDelete) return;
            setIsDeleting(true);
            setDeleteError(null);
            try {
              await deleteWorkspace(workspaceToDelete.id);
              setWorkspaceToDelete(null);
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : "Failed to delete workspace";
              setDeleteError(message);
            } finally {
              setIsDeleting(false);
            }
          }}
          title="Delete Workspace"
          message={`Are you sure you want to delete workspace "${workspaceToDelete.name}"? This action is permanent and cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          isLoading={isDeleting}
          error={deleteError}
          variant="danger"
        />
      )}
    </>
  );
};
